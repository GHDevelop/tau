import { Client } from 'discord.js';
import { CommandLine } from './utils/cli';
import { Logger } from './bot/logger';

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { Command } from './bot/command';
import { Listener } from './bot/listener';
import { Job } from './bot/job';
import { MemberBucket } from './lib/database/member';
import { GuildBucket } from './lib/database/guild';
import { Input } from './bot/input';
import { Emoji } from '@bot/libraries/emoji';
import { Server } from './internal/server';
import { Database } from './lib/database';

export class Framework {
    private static config: BotConfiguration;
    private static client: Client;
    private static logger: Logger;
    private static commands: Command[] = [];
    private static server?: Server;

    /**
     * Starts the bot.
     */
    private static start() {
        this.logger = new Logger();

        // Bootstrap
        this.loadConfiguration();
        this.startServer();
        this.bindGracefulShutdown();

        if (!CommandLine.hasFlag('dry')) {
            // Start the client
            this.logger.info('Logging in...');
            this.client = new Client();
            this.client.login(this.config.authentication.discord.token);

            // Wait for ready
            this.client.on('ready', () => {
                this.logger.clear();
                this.logger.info('Logged in as %s.', this.client.user.tag);
                this.logger.debug('Logged in with Client Id: %s', this.client.user.id);
                this.logger.verbose('This client is a %s.', this.client.user.bot ? 'bot' : 'user');
                this.logger.verbose('Found %d channels across %d guilds.', this.client.channels.size, this.client.guilds.size);
                this.logger.debug('Loading components...');

                this.loadCommands();
                this.loadListeners();
                this.loadScripts();
                this.loadJobs();
                this.listen();

                this.logger.debug('Bot is online...');
            });
        }
        else {
            // Do a dry run - no client

            this.loadCommands();
            this.loadScripts();
        }
    }

    /**
     * Returns the configuration object for the bot.
     */
    public static getConfig() : BotConfiguration {
        return this.config;
    }

    /**
     * Returns the current Discord client.
     */
    public static getClient() : Client {
        return this.client;
    }

    /**
     * Returns the logging level for console output. This can be configured from the bot's config.json file,
     * and overridden via command line flags (`--debug` or `--verbose`).
     */
    public static getLoggingLevel() : ('normal' | 'debug' | 'verbose') {
        if (CommandLine.hasFlag('debug')) return 'debug';
        if (CommandLine.hasFlag('verbose')) return 'verbose';

        return this.config.options.loggingLevel;
    }

    /**
     * Returns the bot's configured environment mode.
     */
    public static getEnvironment() : ('test' | 'production') {
        return this.config.environment;
    }

    /**
     * Loads the config.json file.
     */
    private static loadConfiguration() {
        let configFilePath = path.join(__dirname, '../../', 'config.json');
        let welcome = () => {
            this.logger.error('Welcome!');
            this.logger.error('A starter config.json file was generated for you.');
            this.logger.error('Please edit this file and configure a Discord client token.');

            process.exit();
        }

        if (fs.existsSync(configFilePath) && this.start) {
            this.config = require(configFilePath) as BotConfiguration;

            if (!this.config.authentication.discord.token) {
                return welcome();
            }
        }
        else {
            fs.writeFileSync(configFilePath, JSON.stringify({
                environment: 'test',
                options: { allowCodeExecution: false, loggingLevel: 'normal' },
                server: { enabled: true, port: 3121 },
                authentication: { discord: { token: '' }, cleverbot: { user: '', key: '' }}
            } as BotConfiguration, null, 4));

            return welcome();
        }
    }

    /**
     * Starts the internal socket server.
     */
    private static startServer() {
        this.logger.verbose('Starting socket server on port %d...', this.config.server.port || 3121);
        this.server = new Server(this.config.server.port);
        this.server.start();
    }

    /**
     * Binds to CTRL+C on Windows and Linux in order to implement a graceful shutdown.
     */
    private static bindGracefulShutdown() {
        if (process.platform === 'win32') {
            let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.on('SIGINT', () => {
                process.emit('SIGINT' as any);
            });
        }

        process.on('SIGINT', async () => {
            if (!CommandLine.hasFlag('dry')) {
                this.logger.info('Stopping gracefully...');
                this.logger.verbose('Waiting for client to sign off...');

                // Stop the client
                await this.client.destroy();

                // Stop the server if it is active
                if (this.server) {
                    this.logger.verbose('Waiting for socket server to shut down...');
                    await this.server.stop();
                }

                // Exit, code 0
                this.logger.verbose('All done, sayonara!');
                process.exit();
            }
            else {
                // Stop the server if it is active
                if (this.server) {
                    this.logger.verbose('Waiting for socket server to shut down...');
                    await this.server.stop();
                }

                // Stop the database
                this.logger.verbose('Closing database...');
                await Database.close();

                // Exit, code 0
                process.exit();
            }
        });
    }

    /**
     * Discovers and loads commands into the framework.
     */
    private static loadCommands(inDirectory?: string) {
        if (inDirectory) {
            this.logger.verbose('Scanning for commands:', inDirectory);

            if (!fs.existsSync(inDirectory)) return;
            let files = this.getFilesSync(inDirectory);

            return files.forEach(filePath => {
                this.logger.verbose('Hit:', filePath);
                let classes = require(filePath);

                for (let className in classes) {
                    let command = classes[className];

                    if (typeof command === 'function') {
                        let instance = new command();

                        if (instance instanceof Command) {
                            this.commands.push(instance);
                        }
                    }
                }
            });
        }

        this.loadCommands(path.join(__dirname, '../bot/commands'));
    }

    /**
     * Discovers and loads listeners into the framework.
     */
    private static loadListeners(inDirectory?: string) {
        if (inDirectory) {
            this.logger.verbose('Scanning for listeners:', inDirectory);

            if (!fs.existsSync(inDirectory)) return;
            let files = this.getFilesSync(inDirectory);

            return files.forEach(filePath => {
                this.logger.verbose('Hit:', filePath);
                let classes = require(filePath);

                for (let className in classes) {
                    let listener = classes[className];

                    if (typeof listener === 'function') {
                        let instance = new listener();

                        if (instance instanceof Listener) {
                            instance.start();
                        }
                    }
                }
            });
        }

        this.loadListeners(path.join(__dirname, '../bot/listeners'));
    }

    /**
     * Discovers and loads scripts into the framework.
     */
    private static loadScripts(inDirectory?: string) {
        if (inDirectory) {
            this.logger.verbose('Scanning for scripts:', inDirectory);

            if (!fs.existsSync(inDirectory)) return;
            let files = this.getFilesSync(inDirectory);

            return files.forEach(filePath => {
                this.logger.verbose('Hit:', filePath);
                require(filePath);
            });
        }

        this.loadScripts(path.join(__dirname, '../bot/scripts'));
    }

    /**
     * Discovers and loads cron jobs into the framework.
     */
    private static loadJobs(inDirectory?: string) {
        if (inDirectory) {
            this.logger.verbose('Scanning for jobs:', inDirectory);

            if (!fs.existsSync(inDirectory)) return;
            let files = this.getFilesSync(inDirectory);

            return files.forEach(filePath => {
                this.logger.verbose('Hit:', filePath);
                let classes = require(filePath);

                for (let className in classes) {
                    let job = classes[className];

                    if (typeof job === 'function') {
                        let instance = new job();

                        if (instance instanceof Job) {
                            instance.start();
                        }
                    }
                }
            });
        }

        this.loadJobs(path.join(__dirname, '../bot/jobs'));
    }

    /**
     * Returns an array of absolute paths to files found inside the given absolute directory. This is a recursive
     * and synchronous search.
     */
    private static getFilesSync(dir: string, filelist?: string[]) {
        let files = fs.readdirSync(dir);
        let found : string[] = filelist || [];

        files.forEach(file => {
            if (fs.statSync(dir + '/' + file).isDirectory()) {
                found = this.getFilesSync(dir + '/' + file, found);
            }
            else if (file.toLowerCase().endsWith('.js')) {
                found.push(path.resolve(dir + '/' + file));
            }
        });

        return found;
    }

    /**
     * Listens for messages.
     */
    private static listen() {
        this.client.on('message', async message => {
            // Get the guild and member
            let member = message.member;
            let guild = message.guild;

            // Load guild settings
            if (!guild.settings) {
                guild.settings = new GuildBucket(guild.id);
                await guild.settings.load();
            }

            // Skip bots and non-commands
            if (!message.content.startsWith(guild.settings.prefix)) return;
            if (member.user.bot) return;

            // Load member settings
            if (!member.settings) {
                member.settings = new MemberBucket(guild.id, member.id);
                await member.settings.load();
            }

            // Parse the input
            let input = new Input(message);

            // Find a matching command
            let command = input.getCommand();

            // Run the command
            if (command) {
                if (input.isProper()) {
                    command.execute(input);
                }
                else {
                    let error = input.getError();

                    if (error) {
                        if (error.message.endsWith('.')) {
                            error.message = error.message.substring(0, error.message.length - 1) + ':';
                        }
                    }

                    if (error && (!error.message.startsWith('Please enter a') || error.message.startsWith('Please enter a valid'))) {
                        message.channel.send(`${Emoji.ERROR}  ${error.message}  \`${command.getUsage()}\``);
                    }
                    else {
                        message.channel.send(`${Emoji.HELP}  Usage:  \`${command.getUsage()}\``);
                    }
                }
            }
        });
    }

    /**
     * Finds a command with the specified name or alias.
     */
    public static findCommand(name: string): Command|null {
        for (let i = 0; i < this.commands.length; i++) {
            let command = this.commands[i];

            if (command.hasAlias(name)) {
                return command;
            }
        }

        return null;
    }
}

type BotConfiguration = {
    environment: 'test' | 'production';
    options: {
        allowCodeExecution: boolean;
        loggingLevel: 'normal' | 'debug' | 'verbose';
    };
    server: {
        enabled: boolean;
        port?: number;
    }
    authentication: {
        discord: {
            token: string
        },
        cleverbot: {
            user: string;
            key: string;
        }
    }
};
