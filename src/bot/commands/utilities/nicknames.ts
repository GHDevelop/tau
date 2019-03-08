import { Command, Input } from '@api';
import { GuildMember } from 'discord.js';
const moment = require('moment');

export class Nicknames extends Command {
    constructor() {
        super({
            name: 'nicknames',
            description: 'Display the nickname history for the specified user.',
            arguments: [
                {
                    name: 'user',
                    constraint: 'mention',
                    default: '@member',
                    error: true
                }
            ]
        });
    }

    execute(input: Input) {
        let target = input.getArgument('user') as GuildMember;
        console.log(target);

        let result = '';
        input.member.settings.nameHistory.forEach(record => {
            let timeAgo = _.now() - record.time;
            let m = moment(record.time);
            let isThisYear = (m.format('YYYY') === moment().format('YYYY'));

            let timestamp = (timeAgo < (86400 * 7 * 1000)) ? m.fromNow() :
                ((isThisYear) ? m.format('MMMM Do h:mm a') :
                    m.format('MMMM Do YYYY h:mm a'));

            result += record.name + ' 󠀀󠀀 󠀀󠀀󠀀󠀀· 󠀀󠀀 󠀀󠀀';
            result += timestamp + '\n';
        });

        if (input.member.settings.nameHistory.length <= 0) {
            result = "None";
        }
        input.channel.send({
            embed: {
                color: 3447003,
                author: {
                    name: target.displayName,
                    icon_url: target.user.avatarURL
                },
                title: "Nicknames",
                description: result
            }
        });

    }
}
