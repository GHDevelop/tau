import { Command, Input } from '@api';
import { GuildMember, Message, TextChannel } from 'discord.js';
import { Emoji } from '@bot/libraries/emoji';
import { Framework } from '@core/framework';

export class Race extends Command {
    private races : Races = {};

    constructor() {
        super({
            name: 'race',
            description: 'Race with the bot or other members of your server.',
            arguments: [
                {
                    name: 'join',
                    description: 'Add this argument to join a pending race.',
                    options: ['join'],
                    usage: 'join'
                }
            ]
        });
    }

    async execute(input: Input) {
        if (input.getArgument('join') == 'join') {
            await this.join(input);
        }
        else {
            try {
                await this.start(input);
            }
            catch (err) {
                if (input.channel.id in this.races) {
                    delete this.races[input.channel.id];
                    await input.channel.send(`${Emoji.ERROR}  Race cancelled.`);
                }
            }
        }
    }

    /**
     * Joins an existing race in the channel.
     */
    async join(input: Input) {
        // Fail with an error if no race is found
        if (!(input.channel.id in this.races)) {
            return await input.channel.send(`${Emoji.ERROR}  There is not an active race in this channel.`);
        }

        // Get the race
        let race = this.races[input.channel.id];

        // Fail silently if the race has started
        if (race.started) return;

        // Fail silently if this user is already in the race
        if (this.inRace(input.member, race)) return;

        // Join the race
        race.members.push({
            member: input.member,
            animal: this.pickAnimal(race),
            distance: 0,
            injured: 0
        });

        // Delete the message
        try {
            await input.message.delete();
        }
        catch (err) {}
    }

    /**
     * Starts a new race in the channel.
     */
    async start(input: Input) {
        // Fail with an error if an existing race is found
        if (input.channel.id in this.races) {
            return await input.channel.send(`${Emoji.ERROR}  There is an ongoing race already. Use \`${input.guild.settings.prefix}race join\` to join it.`);
        }

        // Start a new race
        let race = this.races[input.channel.id] = {
            started: false,
            startTime: _.now() + 15000,
            events: [],
            members: [
                {
                    member: input.member,
                    animal: this.pickAnimal(),
                    distance: 0,
                    injured: 0
                }
            ]
        };

        // Update the message until time is up
        let message : Message | undefined;
        while (race.startTime > _.now()) {
            message = await this.updateTimerMessage(message, input.channel as TextChannel, race);

            // Wait if necessary
            if (race.startTime > _.now()) await sleep(Math.min(1500, race.startTime - _.now()));
        }

        // If nobody else joined, add the bot
        if (race.members.length == 1) {
            race.members.push({
                member: input.guild.members.get(Framework.getClient().user.id)!,
                animal: this.pickAnimal(race),
                distance: 0,
                injured: 0
            });
        }

        // Race
        while (true) {
            this.performRace(race);

            await this.updateRaceMessage(message!, race);
            await sleep(1500);

            if (this.getNumberWinners(race) == race.members.length) break;
        }

        await this.updateFinishedMessage(message!, race);
        delete this.races[input.channel.id];
    }

    /**
     * Returns true if the given member is a participant in the given race.
     */
    private inRace(member: GuildMember, race: RaceInstance) {
        for (let i = 0; i < race.members.length; i++) {
            if (race.members[i].member == member) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns the animal assigned to the given member in the given race.
     */
    private getAnimal(member: GuildMember, race: RaceInstance) {
        for (let i = 0; i < race.members.length; i++) {
            if (race.members[i].member == member) {
                return Animals[race.members[i].animal];
            }
        }

        return Animals[0];
    }

    /**
     * Returns the animal assigned to the given member in the given race.
     */
    private pickAnimal(race ?: RaceInstance) {
        let used : number[] = [];
        let available : number[] = [];

        if (race) {
            _.each(race.members, entry => {
                used.push(entry.animal);
            });
        }

        for (let i = 0; i < Animals.length; i++) {
            if (used.indexOf(i) < 0) {
                available.push(i);
            }
        }

        return _.sample(available)!;
    }

    /**
     * Updates (or creates) the timer message for a race.
     */
    private async updateTimerMessage(message: Message | undefined, channel: TextChannel, race: RaceInstance) : Promise<Message> {
        // Heading
        let text = `**Let's race!**\n`;
        let remaining = Math.ceil((race.startTime - _.now()) / 1000);
        let s = (remaining != 1) ? 's' : '';
        text += `This race is starting in ${remaining} second${s}. Type \`${channel.guild.settings.prefix}race join\` before then to participate.\n\n`;

        // Add race participants
        _.each(race.members, entry => {
            let animal = this.getAnimal(entry.member, race);
            text += `:${animal.icon}: ` + ('\\▪ '.repeat(26) + `:checkered_flag:  \`${entry.member.displayName}\`\n`);
        });

        // If there is a message, update it
        if (message) return await message.edit(text);

        // Otherwise, post it
        return await channel.send(text) as Message;
    }

    /**
     * Updates the message for a race.
     */
    private async updateRaceMessage(message: Message, race: RaceInstance) : Promise<void> {
        // Heading
        let text = `${Emoji.LOADING}  **Race is running!**\nGood luck!\n\n`;

        // Add race participants
        _.each(race.members, entry => {
            let animal = this.getAnimal(entry.member, race);
            let progress = _.clamp(entry.distance / 26, 0, 1);
            let left = Math.floor(entry.distance);
            let right = 26 - Math.floor(entry.distance);

            if (progress == 1) {
                text += '\\▪ '.repeat(29);
                text += `:${animal.icon}:`;
            }
            else {
                text += '\\▪ '.repeat(left);
                text += `:${animal.icon}: `;
                text += '\\▪ '.repeat(right);
                text += `:checkered_flag:`;
            }

            // Add name
            text += `   \`${entry.member.displayName}\``;

            // Add place
            if (progress == 1) {
                text += `  \`#${entry.place}\`   `;

                if (entry.place == 1) {
                    text += ':trophy:';
                }
            }

            text += '\n';
        });

        // Add events
        if (race.events.length > 0) {
            text += '\n';

            race.events.forEach(event => {
                text += `:skull_crossbones:  ${event}\n`;
            });
        }

        // Update the message
        await message.edit(text.trim());
    }

    /**
     * Updates the message for a finished race.
     */
    private async updateFinishedMessage(message: Message, race: RaceInstance) : Promise<void> {
        // Heading
        let text = `${Emoji.SUCCESS}  **Race is finished! ${this.getWinner(race)} won!**\n\n`;

        // Add race participants
        _.each(race.members, entry => {
            let animal = this.getAnimal(entry.member, race);
            let progress = _.clamp(entry.distance / 26, 0, 1);
            let left = Math.floor(progress);
            let right = 26 - Math.floor(progress);

            if (progress == 1) {
                text += '\\▪ '.repeat(29);
                text += `:${animal.icon}:`;
            }
            else {
                text += '\\▪ '.repeat(left);
                text += `:${animal.icon}: `;
                text += '\\▪ '.repeat(right);
                text += `:checkered_flag:`;
            }

            // Add name
            text += `   \`${entry.member.displayName}\``;

            // Add place
            if (progress == 1) {
                text += `  \`#${entry.place}\`   `;

                if (entry.place == 1) {
                    text += ':trophy:';
                }
            }

            text += '\n';
        });

        // Update the message
        await message.edit(text);
    }

    /**
     * Runs the next tick of the given race.
     */
    private performRace(race: RaceInstance) {
        race.members.forEach(row => {
            if (row.place) return;

            // Get the base speed of the animal
            let speed = Animals[row.animal].speed * 1.5;

            // Apply injuries
            if (row.injured > 0) {
                row.injured--;
                speed *= 0.5;
            }
            else {
                if (_.random(1, 30) == 30 && row.distance <= 20) {
                    row.injured = _.random(2, 8);
                    race.events.push(row.member.displayName + ' injured their ' + _.sample(['leg', 'neck', 'foot']) + '!');
                }
            }

            // Apply a random variance
            speed += _.random(-0.3, 0.3);

            // Add to their total distance
            row.distance += speed;

            // Check for victoy
            if (row.distance >= 26) {
                row.place = this.getNumberWinners(race) + 1;
                row.distance = 26;
            }
        });
    }

    /**
     * Returns the total number of winners in the race.
     */
    private getNumberWinners(race: RaceInstance) {
        let winners = 0;

        race.members.forEach(row => {
            if (row.place) winners++;
        });

        return winners;
    }

    /**
     * Returns the total number of winners in the race.
     */
    private getWinner(race: RaceInstance) {
        let winner : GuildMember | undefined;

        race.members.forEach(row => {
            if (row.place == 1) winner = row.member;
        });

        return winner!;
    }
}

export let Animals : Animal[] = [
    { icon: 'pig', speed: 1.9 },
    { icon: 'dog', speed: 2.1 },
    { icon: 'cat', speed: 2.3 },
    { icon: 'hatched_chick', speed: 1.2 },
    { icon: 'unicorn', speed: 3 },
    { icon: 'elephant', speed: 1.7 },
    { icon: 'rabbit2', speed: 2.2 },
    { icon: 'snail', speed: 1 },
    { icon: 'mouse', speed: 1.3 }
];

type Animal = {
    icon: string;
    speed: number;
};

type Races = {
    [channelId: string]: RaceInstance;
};

type RaceInstance = {
    members: {
        member: GuildMember;
        animal: number;
        distance: number;
        place?: number;
        injured: number;
    }[];

    started: boolean;
    startTime: number;
    events: string[];
};
