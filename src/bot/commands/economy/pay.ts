import { Command, Input } from '@api';
import { GuildMember } from 'discord.js';
import { Emoji } from '@bot/libraries/emoji';
import { Economy } from '@bot/libraries/economy';

export class Pay extends Command {
    constructor() {
        super({
            name: 'pay',
            description: 'Pays the specified user.',
            arguments: [
                {
                    name: 'user',
                    constraint: 'mention',
                    required: true,
                    eval: (input, args, message) => {
                        if (message.member == (input as GuildMember)) return false;
                        return true;
                    }
                },
                {
                    name: 'amount',
                    constraint: 'number',
                    required: true,
                    eval: (input, args, message) => {
                        if (input < 1) return false;
                        return true;
                    }
                }
            ]
        });
    }

    async execute(input: Input) {
        let user = input.getArgument('user') as GuildMember;
        let amount = input.getArgument('amount') as number;

        // Only send dollars
        amount = Math.floor(amount);

        // Reject if the balance is not enough
        if (amount > input.member.settings.currency) {
            await input.channel.send(`${Emoji.ERROR}  Insufficient funds. The most you can send is **$${input.member.settings.currency.toFixed(2)}**.`);
            return;
        }

        // Wait for the transactions to complete
        await Promise.all([
            Economy.removeBalance(input.member, amount),
            Economy.addBalance(user, amount)
        ]);

        // Receipt
        await input.channel.send(`${Emoji.SUCCESS}  Success! ${input.member} has sent **$${amount.toFixed(2)}** to ${user}.`);
    }
}
