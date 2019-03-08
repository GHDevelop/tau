import { Command, Input } from "@api";
import { Emoji } from "@bot/libraries/emoji";
import * as Jimp from 'jimp';
import { Betting } from "@bot/libraries/betting";
import { Message } from "discord.js";
import { Reactions, ReactionListener } from "@bot/libraries/reactions";
import { GuildMember } from "discord.js";
import { Economy } from "@bot/libraries/economy";
import { TextChannel } from "discord.js";

const sharp = require('sharp');
const randomNumber = require('random-number-csprng');

let base = sharp(pub('roulette/wheel.png'));
let pointer : any;

const tiles = [10, 5, 1, 2, 1, 5, 1, 10, 1, 2, 1, 20, 1, 2, 1];

export class Roulette extends Command {
    constructor() {
        super({
            name: 'roulette',
            description: 'Starts a game of wheel of fortune. If it lands on your number, your bet is multiplied by that number. If it doesn\'t, say goodbye to your cash.',
            aliases: ['spin', 'wheel', 'fortune']
        });

        // Preload the pointer image via Jimp
        Jimp.read(pub('roulette/pointer.png')).then((j: any) => {
            pointer = j;
        });
    }

    async execute(input: Input) {
        // Check if there is another gambling game ongoing
        if (!Betting.isGameAvailable(input.channel)) {
            input.channel.send(`${Emoji.ERROR}  Another gambling game is running in the same channel. Wait for it to complete.`);
            return;
        }

        // Reserve the channel
        let reservation = Betting.reserve(input.channel);

        // Pick where the wheel will spin to
        let landingTileIndex = 3;//await randomNumber(0, 14);
        let landingTileNumber = tiles[landingTileIndex];
        let spunWheel = await this.generateRotatedWheel(landingTileIndex * 24 + 12);

        // Send game welcome message
        let welcomeMessages = await this.welcome(input);

        // Send countdown
        let startTime = _.now();
        let countdownMessage = await input.channel.send(`_ _\n${Emoji.LOADING}  **Spinning** in 20 seconds...`) as Message;

        // Listen for bets
        let bets : {[id: string]: Bet} = {};
        let listeners : ReactionListener[] = [];

        reservation.on('bet', async (member, amount) => {
            let message = await input.channel.send(`:sparkles:  ${member} You are betting **$${amount.toFixed(2)}**. Please select the number to bet on.`) as Message;
            let listener = Reactions.listen(message, reaction => {
                if (reaction.member == member) {
                    let number = this.getReactionNumber(reaction.emoji);
                    if (number == 0) return;

                    if (reaction.action == 'add') {
                        bets[member.id].number = number;
                        bets[member.id].message.edit(`:sparkles:  ${member} You are betting **$${amount.toFixed(2)}** on number **${number}**. Good luck!`);
                    }
                    else {
                        if (number == bets[member.id].number) {
                            bets[member.id].number = undefined;
                            bets[member.id].message.edit(`:sparkles:  ${member} You are betting **$${amount.toFixed(2)}**. Please select the number to bet on.`);
                        }
                    }
                }
            });
            listeners.push(listener);

            // If the member has already placed a bet, delete their old one
            if (member.id in bets) {
                if (bets[member.id].message.deletable) {
                    await bets[member.id].message.delete();
                }

                delete bets[member.id];
            }

            // Add their initial bet
            bets[member.id] = {
                amount: amount,
                message: message,
                member: member
            };

            // Add reactions to the message
            await Reactions.addReactions(message, [Emoji.SPIN_1, Emoji.SPIN_2, Emoji.SPIN_5, Emoji.SPIN_10, Emoji.SPIN_20]);
        });

        // Count down
        await this.countdown(countdownMessage, startTime);

        // Close all reaction listeners
        _.each(listeners, listener => {
            listener.close();
        });

        // Count number of bets
        let validBets = 0;
        _.each(bets, bet => {
            if (bet.number) validBets++;
        });

        // Delete the messages
        try {
            for (let id in bets) {
                await bets[id].message.delete();
            }

            await welcomeMessages[0].delete();
            await welcomeMessages[1].delete();
            await countdownMessage.delete();
        }
        catch (err) {}

        // Stop if there aren't any bets
        if (validBets == 0) {
            reservation.close();
            await input.channel.send([
                `${Emoji.ERROR}  There were no bets, so the game was cancelled.`
            ]);
            return;
        }

        // Post the resulting wheel
        await input.channel.send({ files: [ spunWheel ] });
        await input.channel.send([
            '_ _',
            `**The wheel landed on ${landingTileNumber}!**`,
            await this.calculateWinnersLosers(landingTileNumber, bets),
            '_ _'
        ]);

        // Award or take monies
        for (let id in bets) {
            let bet = bets[id];

            if (bet.number) {
                if (bet.number == landingTileNumber) {
                    let amount = bet.amount + (bet.amount * landingTileNumber);
                    await Economy.addBalance(bet.member, amount, input.channel as TextChannel);
                }
                else {
                    await Economy.removeBalance(bet.member, bet.amount);
                }
            }
        }

        // Release the reservation
        reservation.close();
    }

    /**
     * Returns the buffer for a transparent PNG image of the spinning wheel with the specified degrees of rotation.
     */
    private async generateRotatedWheel(degrees: number) {
        degrees %= 360;

        let copy = base.clone().rotate(degrees, {
            background: '#ffffff00'
        });

        let buffer = await copy.toBuffer();
        let rotated = await Jimp.read(buffer);
        let canvas = new Jimp(200, 200, 0xffffff00);

        canvas.composite(rotated, Math.floor(-(rotated.bitmap.width / 2 - 100)), Math.floor(-(rotated.bitmap.height / 2 - 100)));
        canvas.composite(pointer, 0, 0);

        return await canvas.getBufferAsync(Jimp.MIME_PNG);
    }

    private getReactionNumber(emoji: string) : number {
        switch (emoji) {
            case Emoji.SPIN_1: return 1;
            case Emoji.SPIN_2: return 2;
            case Emoji.SPIN_5: return 5;
            case Emoji.SPIN_10: return 10;
            case Emoji.SPIN_20: return 20;
        }

        return 0;
    }

    private async welcome(input: Input) {
        return [
            await input.channel.send([
                '**Wheel of Fortune**',
                'The following wheel will spin shortly. Place a bet on the number you think it will land on!',
                'If you are correct, your bet will be multiplied by that amount. If you are wrong, you lose your cash.',
                `To place a bet, use \`${input.guild.settings.prefix}bet <amount>\`. You will then be asked which number to bet on.`,
                '_ _'
            ].join('\n')) as Message,
            await input.channel.send({
                files: [ await this.generateRotatedWheel(0) ]
            }) as Message
        ];
    }

    private async countdown(message: Message, start: number) {
        let elapsed = (_.now() - start) / 1000;
        let remaining = Math.ceil(20 - elapsed);

        let fn = async () => {
            elapsed = (_.now() - start) / 1000;
            remaining = Math.ceil(20 - elapsed);

            if (remaining > 0) {
                await message.edit(`_ _\n${Emoji.LOADING}  **Spinning** in ${remaining} seconds...`);
            }
            else {
                await message.edit(`${Emoji.LOADING}  **Spinning** now...`);
            }
        };

        while (remaining > 0) {
            await sleep(Math.min(2000, remaining * 1000));
            await fn();
        }
    }

    private async calculateWinnersLosers(number: number, bets: {[id: string]: Bet}) : Promise<string> {
        let winners : string[] = [];
        let losers : string[] = [];
        let output = '';

        _.each(bets, bet => {
            if (bet.number) {
                if (bet.number == number) winners.push(bet.member.toString());
                else losers.push(bet.member.toString());
            }
        });

        if (winners.length == 0) return 'Everybody lost!';
        if (losers.length == 0) return 'Everybody won!';

        return `Winners: ${winners.join(', ')}\nLosers: ${losers.join(', ')}`;
    }
}

type Bet = {
    amount: number;
    number?: number;
    message: Message;
    member: GuildMember;
};
