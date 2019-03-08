import { Database } from "../database";

export class GuildBucket {
    protected id: string;
    protected rowExists: boolean = false;
    protected status: Status;

    /**
     * The prefix to use for the guild.
     */
    public prefix: string = '!';

    /**
     * The voice settings to use for the guild.
     */
    public voice: GuildVoiceSettings = {
        volume: 0.5
    };

    /**
     * The notification messages to use for the guild.
     */
    public notifications: GuildNotificationSettings = {
        newYoutubeVideo: 'New video available! {{ link }}',
    };

    /**
     * The quotes saved to the guild.
     */
    public quotes: GuildQuote[] = [];

    /**
     * Constructs a new GuildBucket instance.
     */
    constructor(id: string) {
        let r : Function = () => {};
        let p : Promise<void> = new Promise(resolve => {
            r = resolve;
        });

        this.id = id;
        this.status = {
            loaded: false,
            loading: false,
            promise: p,
            resolver: r
        };
    }

    /**
     * Saves the current state of the guild.
     */
    public async save(): Promise<void> {
        // Throw an error if we haven't already loaded
        if (!this.status.loaded) {
            throw new Error('Attempted to save a GuildBucket which has not been loaded.');
        }

        // Duplicate this object
        let o : any = _.clone(this);

        // Remove functions and irrelevant variables
        _.each(o, (val, key) => {
            if (typeof val == 'function' || key == 'id' || key == 'rowExists' || key == 'status') {
                delete o[key];
            }
        });

        // Encode with JSON
        let json = JSON.stringify(o, null, 4);

        // Does the row exist?
        let exists = this.rowExists;

        // Run the query
        if (exists) {
            // await Database.run('UPDATE guilds SET settings = ? WHERE id = ?', json, this.id);
        }
        else {
            this.rowExists = true;
            // await Database.run('INSERT INTO guilds (id, settings) VALUES (?, ?)', this.id, json);
        }
    }

    /**
     * Loads the guild's data from the database.
     */
    public async load(): Promise<void> {
        // Skip if already loaded
        if (this.status.loaded) return;
        if (this.status.loading) return await this.status.promise;

        // Start loading
        this.status.loading = true;

        // Get the database row
        let row = await Database.get<GuildRow>('SELECT * FROM guilds WHERE id = ?', this.id);

        // If the row exists, parse its data
        if (row) {
            this.rowExists = true;

            if (row.settings) {
                let settings = JSON.parse(row.settings);
                let o = _.defaultsDeep(settings, this);

                _.each(o, (val, key) => {
                    if (key == 'id' || key == 'rowExists' || key == 'status') return;
                    (this as any)[key] = val;
                });
            }
        }

        // Set the status and resolve the loading promise
        this.status.loaded = true;
        this.status.resolver();
    }

    /**
     * Waits for the guild to finish loading.
     */
    public async wait() {
        if (!this.status.loaded) {
            await this.status.promise;
        }
    }
}

export type GuildVoiceSettings = {
    /**
     * The default volume for the bot when streaming music on a voice channel.
     * @default 50
     */
    volume: number;
}

export type GuildNotificationSettings = {
    /**
     * The text to display when a member joins the guild, or undefined if not enabled by the guild's owner.
     */
    memberAdded?: string;

    /**
     * The text to display when a member leaves the guild, or undefined if not enabled by the guild's owner.
     */
    memberRemoved?: string;

    /**
     * The text to display when a new YouTube video is found on a watched channel.
     */
    newYoutubeVideo: string;
}

export type GuildQuote = {
    memberId: string;
    message: string;
    time: number;
}

export type GuildRow = {
    id: string;
    settings?: string;
}

type Status = {
    loaded: boolean;
    loading: boolean;
    promise: Promise<void>;
    resolver: Function
}
