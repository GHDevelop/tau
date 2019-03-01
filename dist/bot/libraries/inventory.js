"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reactions_1 = require("./reactions");
const emoji_1 = require("./emoji");
class Inventory {
    static async addItem(member, item, amount, announceChannel) {
        await member.load();
        member.settings.inventory[this.getIndex(member, item)].amount += amount;
        await member.settings.save();
        if (announceChannel) {
            let channel = announceChannel;
            await channel.send(`${this.getIcon(item)}  ${member} found **${amount}x** ${this.getName(item)}.`);
        }
    }
    static async removeItem(member, item, amount) {
        await member.load();
        let index = this.getIndex(member, item);
        let balance = member.settings.inventory[index].amount;
        if (amount > balance) {
            throw new Error(`Cannot spend ${amount} of ${Item[item]} when the balance is only ${balance}.`);
        }
        member.settings.inventory[index].amount -= amount;
        await member.settings.save();
    }
    static async hasItem(member, item, amount = 1) {
        await member.load();
        let balance = await this.getItemAmount(member, item);
        return amount <= balance;
    }
    static async transactItem(member, item, amount = 1, txnChannel) {
        await member.load();
        if (!(await this.hasItem(member, item, amount))) {
            return false;
        }
        let channel = txnChannel;
        let message = await channel.send(`${this.getIcon(item)}  ${member} This will cost you **${amount}x** ${this.getName(item)}. Are you sure?`);
        let resolver;
        let promise = new Promise(resolve => { resolver = resolve; });
        let finished = false;
        reactions_1.Reactions.listen(message, async (reaction) => {
            if (finished)
                return;
            if (reaction.action == 'add' && reaction.member == member) {
                if (reaction.emoji == emoji_1.Emoji.SUCCESS) {
                    finished = true;
                    await this.removeItem(member, item, amount);
                    await message.edit(`${emoji_1.Emoji.SUCCESS}  ${member} Transaction approved.`);
                    message.deleteAfter(5000);
                    resolver(true);
                }
                else if (reaction.emoji == emoji_1.Emoji.ERROR) {
                    finished = true;
                    resolver(false);
                    await message.edit(`${emoji_1.Emoji.ERROR}  ${member} Transaction declined.`);
                    message.deleteAfter(5000);
                }
            }
        });
        await reactions_1.Reactions.addReactions(message, [emoji_1.Emoji.SUCCESS, emoji_1.Emoji.ERROR]);
        return await promise;
    }
    static async getItemAmount(member, item) {
        await member.load();
        for (let i = 0; i < member.settings.inventory.length; i++) {
            if (member.settings.inventory[i].item == item) {
                return member.settings.inventory[i].amount;
            }
        }
        return 0;
    }
    static async getAllItems(member) {
        await member.load();
        let inventory = member.settings.inventory;
        let items = [];
        _.each(inventory, row => {
            items.push({
                id: row.item,
                name: this.getName(row.item),
                icon: this.getIcon(row.item),
                amount: row.amount
            });
        });
        return items;
    }
    static getName(item) {
        return Item[item];
    }
    static getIcon(item) {
        return exports.InventoryIcons[this.getName(item)];
    }
    static getIndex(member, item) {
        for (let i = 0; i < member.settings.inventory.length; i++) {
            if (member.settings.inventory[i].item == item) {
                return i;
            }
        }
        member.settings.inventory.push({
            item: item,
            amount: 0
        });
        return member.settings.inventory.length - 1;
    }
}
exports.Inventory = Inventory;
var Item;
(function (Item) {
    Item[Item["Fish"] = 0] = "Fish";
    Item[Item["Star"] = 1] = "Star";
    Item[Item["Glitter"] = 2] = "Glitter";
    Item[Item["Bolt"] = 3] = "Bolt";
    Item[Item["Lollipop"] = 4] = "Lollipop";
    Item[Item["Strawberry"] = 5] = "Strawberry";
    Item[Item["Cookie"] = 6] = "Cookie";
    Item[Item["Cake"] = 7] = "Cake";
    Item[Item["Candy"] = 8] = "Candy";
    Item[Item["Trophy"] = 9] = "Trophy";
    Item[Item["Gift"] = 10] = "Gift";
    Item[Item["Book"] = 11] = "Book";
    Item[Item["Heart"] = 12] = "Heart";
    Item[Item["LoveLetter"] = 13] = "LoveLetter";
    Item[Item["Orange"] = 14] = "Orange";
    Item[Item["ChocolateBar"] = 15] = "ChocolateBar";
    Item[Item["Egg"] = 16] = "Egg";
    Item[Item["Case"] = 17] = "Case";
})(Item = exports.Item || (exports.Item = {}));
exports.InventoryIcons = {
    Fish: '🐟',
    Star: '⭐',
    Glitter: '✨',
    Bolt: '⚡',
    Lollipop: '🍭',
    Strawberry: '🍓',
    Cookie: '🍪',
    Cake: '🍰',
    Candy: '🍬',
    Trophy: '🏆',
    Gift: '🎁',
    Book: '📘',
    Heart: '💖',
    LoveLetter: '💌',
    Orange: '🍊',
    ChocolateBar: '🍫',
    Egg: '🥚',
    Case: '💼'
};
//# sourceMappingURL=inventory.js.map