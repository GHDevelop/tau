import { GuildMember, Role } from 'discord.js';
import { Input } from '@core/api';
import { Logger } from './logger';

export abstract class Command {
    private logger: Logger;
    private options: CommandOptions;

    constructor(options: CommandOptions) {
        this.options = options;
        this.logger = new Logger('command:' + this.options.name);
    }

    /**
     * Executes the command for the given input.
     */
    public execute(input: Input): Promise<void> | void {
        input.channel.send('This command is not yet implemented.');
    }

    /**
     * Returns the logger instance for this command.
     */
    protected getLogger(): Logger {
        return this.logger;
    }

    /**
     * Returns the command's name.
     */
    public getName(): string {
        return this.options.name.toLowerCase();
    }

    /**
     * Returns an array of the command's aliases, including its name as the first element.
     */
    public getAliases(): string[] {
        let names = [this.getName().toLowerCase()];

        if (this.options.aliases) {
            this.options.aliases.forEach(alias => {
                names.push(alias.toLowerCase());
            });
        }

        return names;
    }

    /**
     * Returns whether the command matches the given alias or name (case-insensitive).
     */
    public hasAlias(alias: string): boolean {
        return this.getAliases().indexOf(alias.toLowerCase()) >= 0;
    }

    /**
     * Returns the command's help description.
     */
    public getDescription(): string {
        return this.options.description;
    }

    /**
     * Returns an array of the command's arguments.
     */
    public getArguments(): CommandArgument[] {
        return this.options.arguments || [];
    }

    /**
     * Returns usage for this command.
     */
    public getUsage() : string {
        let usage = this.getName();
        let args : string[] = [];

        this.getArguments().forEach(arg => {
            let text = arg.name;

            if (arg.options) {
                text = arg.options.join('|');
            }

            if (arg.default && !arg.required) {
                if (arg.default == '@member') {
                    text += ' = you';
                }
                else {
                    text += ' = ' + arg.default;
                }
            }

            if (arg.required) args.push('<' + text + '>');
            else args.push('[' + text + ']');
        });

        return `${usage} ${args.join(' ')}`.trim();
    }
}

type CommandOptions = {
    /**
     * The name of the command, which is used by users to call it.
     */
    name: string;

    /**
     * The description of the command as shown on the help page.
     */
    description: string;

    /**
     * A string array of additional names with which this command can be called.
     */
    aliases?: string[];

    /**
     * An array of arguments for this command.
     */
    arguments?: CommandArgument[];
};

type CommandArgument = {
    /**
     * The name of the argument, which will be used by you to retrieve its value.
     */
    name: string;

    /**
     * A description of the argument, which will be displayed in the help page.
     */
    description?: string;

    /**
     * Whether or not this argument is required (default is `false`).
     */
    required?: boolean;

    /**
     * A custom regular expression to match this argument (default is `("[^"]+"|[^\\s"]+)` but this varies depending
     * on whether you've set a `constraint`).
     */
    pattern?: RegExp;

    /**
     * A constraint for the argument. This essentially changes the pattern to fit the constraint, but also
     * will make the argument return a matching data type. Use an array to accept multiple types in one argument.
     *
     * - `number` - decimals and integers
     * - `alphanumeric` - letters, numbers, periods, underscores, dashes
     * - `char` - a single character
     * - `mention` - a mention of a user, returns a `GuildMember`
     * - `emoji` - a utf-8 emoji character, returns a `string`
     * - `role` - a mention of a role, returns a `Role`
     * - `boolean` - one of `yes|no|true|false|1|0|on|off`, returns a `boolean`
     */
    constraint?: CommandConstraint | CommandConstraint[];

    /**
     * An enumeration of possible values this argument can be. If the user specifies a value not in this
     * enumeration, the argument fails to match.
     */
    options?: string[] | number[];

    /**
     * The default value of this argument.
     *
     * - For a `mention` constraint, you can set this as `'@member'` to default to the calling guild member.
     */
    default?: string | number | null | GuildMember | Role | boolean | undefined;

    /**
     * If set to true, the argument will "expand" and capture the rest of the text in the command as its value. In
     * other words, it doesn't separate the rest of the text by spaces. Default is `false`.
     *
     * **Note**  —  This overrides the pattern to `^(.+)$`
     */
    expand?: boolean;

    /**
     * If the argument is optional, this option is set to `true`, and the user provides a value which does not match
     * the argument's constraints, pattern, or options, then the command will be rejected.
     */
    error?: boolean;
};

type CommandConstraint = 'number' | 'string' | 'alphanumeric' | 'char' | 'mention' | 'emoji' | 'role' | 'boolean' | 'url';
