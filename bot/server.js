const Discord = require("discord.js");
const client = new Discord.Client();

const fetch = require("node-fetch");
require('dotenv').config();

let reactionData = {};


fetch(`${process.env.API_URI}/api/messages/all`).then(res => {

    if(!res.ok)
    {
        console.error("API Server responsed with status code ", res.status);
    }
    else
    {
        res.json().then(json => {
            
            

            let map = {};

            for(let i = 0; i < json.length; i++)
            {
                let msg = json[i];
                map[msg.message] = {
                    id: msg.message,
                    guild_id: msg.guild,
                    channel_id: msg.channel,
                    reactions: {}
                }
                for(let j = 0; j < msg.reactions.length; j++)
                {
                   map[msg.message].reactions[msg.reactions[j].emoji] = msg.reactions[j].role;
                }
            }
            
            reactionData = map;

            console.log(reactionData);
        }).catch(err => console.error(err));
    }
}).catch(err => console.error(err));


client.on("messageReactionAdd", (reaction, user) => {
    if(!reaction || !user)
        return;

    // Find if this is monitored
    // If its the bot, don't do anything
    if(user.id === client.user.id) {

        return;
    }
    if(!reactionData[reaction.message.id]) {
        return;
    }
    reaction.remove(user).catch(err => console.error(err));
    // Add user to role
    reaction.message.guild.fetchMember(user).then( member => {
        if(member.roles.get(reactionData[reaction.message.id].reactions[reaction.emoji.id])) {
            console.log(`Removed ${user.username}#${user.discriminator} from role ${reactionData[reaction.message.id].reactions[reaction.emoji.id]}`);
            member.removeRole(reactionData[reaction.message.id].reactions[reaction.emoji.id]).catch(err => console.error(err));
        }
        else
        {
            console.log(`Added ${user.username}#${user.discriminator} to role ${reactionData[reaction.message.id].reactions[reaction.emoji.id]}`);
            member.addRole(reactionData[reaction.message.id].reactions[reaction.emoji.id]).catch(err => console.error(err));
        }
    }).catch(err => console.error(err));
});

// Obtained from Github for non-cached messages
client.on('raw', packet => {
    // We don't want this to run on unrelated packets
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
    // Grab the channel to check the message from
    const channel = client.channels.get(packet.d.channel_id);
    // There's no need to emit if the message is cached, because the event will fire anyway for that
    if (channel.messages.has(packet.d.message_id)) return;
    // Since we have confirmed the message is not cached, let's fetch it
    channel.fetchMessage(packet.d.message_id).then(message => {
        // Emojis can have identifiers of name:id format, so we have to account for that case as well
        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
        // This gives us the reaction we need to emit the event properly, in top of the message object
        const reaction = message.reactions.get(emoji);
        // Adds the currently reacting user to the reaction's users collection.
        if (reaction) reaction.users.set(packet.d.user_id, client.users.get(packet.d.user_id));
        // Check which type of event it is before emitting
        if (packet.t === 'MESSAGE_REACTION_ADD') {
            client.emit('messageReactionAdd', reaction, client.users.get(packet.d.user_id));
        }
        if (packet.t === 'MESSAGE_REACTION_REMOVE') {
            client.emit('messageReactionRemove', reaction, client.users.get(packet.d.user_id));
        }
    }).catch(err => console.error(err));
});

// On ready
client.on("ready", () => {

    client.user.setActivity("emi.gg", {url: 'http://emi.gg', type: 3}).catch(err => console.error(err));
    console.log(`Logged in as ${client.user.tag}!`);
    // After 3 seconds, look for the messages we have registered and add reactions to them, and remove reactions that aren't registered

    for(let msg_id in reactionData) {
        console.log("Fetching for ", msg_id);
        console.log(reactionData[msg_id]);
        let guild = client.guilds.get(reactionData[msg_id].guild_id);
        if(!guild) {
            continue;
        }
        let channel = guild.channels.get(reactionData[msg_id].channel_id);
        if(!channel) {
            continue;
        }

        channel.fetchMessage(msg_id)
            .then(msg => {
                // React for emojis we have registered
                for(let emoji in reactionData[msg_id].reactions) {
                    if(emoji !== undefined && emoji !== "undefined")
                        msg.react(emoji).catch(err => console.error(err));
                }
                // Also collect emojis that are of us and make sure they are unreacted if not registered anymore
                
                msg.reactions.forEach((reaction) => 
                {
                    // Check if this exists in reactions
                    
                    let exists = reactionData[msg_id].reactions[reaction.emoji.id] !== undefined;
                    
                    // Doesn't exist so remove all reactions
                    if(!exists) {
                        console.log("Does not exist");
                        reaction.fetchUsers(100).then(col => col.forEach(user => {
                            reaction.remove(user).catch(err => console.error(err));
                        }));
                    }
                    
                });
            })
            .catch(err => {
                if(err.message !== 'Unknown Message')
                    console.error(err);
            });
    }

});
client.on("messageDelete", msg => {
    
    if(reactionData[msg.id])
    {
        delete reactionData[msg.id];
        fetch(`${process.env.API_URI}/api/messages/message/${msg.id}/bot`, {
            method: 'DELETE',
            headers: {
                'Authorization': process.env.BOT_TOKEN
            }
        }).catch(err => console.error(`Failed to POST deleted message notif\n${err}`));
    }
});
client.on("channelDelete", (channel) => {

    if(channel.type !== "text")
        return;
    if(!channel.guild)
        return;
    // Delete reaction data that are in this channel and then tell back-end
    let found = false;
    for(let msg_id in reactionData)
    {
        if(reactionData[msg_id].channel_id === channel.id)
        {
            delete reactionData[msg_id];
            found = true;
        }
    }
    if(found) {
        fetch(`${process.env.API_URI}/api/messages/guild/${channel.guild.id}/channel/${channel.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': process.env.BOT_TOKEN
            }
        }).catch(err => console.error(`Failed to POST deleted channel notif\n${err}`));
    }
});

client.on("guildDelete", (guild) => {

    let found = false;
    for(let msg_id in reactionData)
    {
        if(reactionData[msg_id].guild_id === guild.id)
        {
            delete reactionData[msg_id];
            found = true;
        }
    }
    if(found) {
        fetch(`${process.env.API_URI}/api/messages/guild/${guild.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': process.env.BOT_TOKEN
            }
        }).catch(err => console.error(`Failed to POST deleted guild notif\n${err}`));
    }
});

client.on("message", msg => {
    if(msg.content.startsWith("!>colorcode"))
    {
        let msgArgs = msg.content.split(" ");
        if(msgArgs.length < 2)
        {
            msg.channel.send("Invalid Syntax For Color Code!\nSyntax should be !>colorcode HEXADECIMAL_COLORCODE");
        }
        else
        {
            let code = msgArgs[1];
            if(code.length !== 6)
            {
                msg.channel.send("Invalid Hexadecimal Code!");
            }
            else
            {
                let regex = /([0-9ABCDEF]{6})/g;

                let result = code.match(regex);

                if(result === null)
                {
                    msg.channel.send("Invalid Hexadecimal Code!");
                }
                else
                {
                    let decimalColor = parseInt(result[0], 16);


                    msg.channel.send({embed: {
                        color: decimalColor,
                        author: {
                            name: `Requested by ${msg.author.username}`,
                            icon_url: msg.author.avatarURL
                        },
                        title: `Color of #${code}`,
                        timestamp: new Date()
                    }});
                }
            }
        }
    }
});
client.on("disconnect", (event) => {
    console.log("Bot was disconnected, code ", event.code);
    console.log("Reason: ", event.reason);

    console.log("Attempting to reconnect...");
    setTimeout(() => client.login(process.env.BOT_TOKEN), 5000);
});

client.on("error", (err) => {
    console.log("Bot encountered a connection error", err);
});

const io = require("socket.io-client");

const socket = io(`${process.env.API_URI}?token=${process.env.SOCKET_TOKEN}`)


socket.on("authenticated", (status) => {
    if(status)
    {
        console.log("Connected to API and Authenticated");
        try {
            client.login(process.env.BOT_TOKEN).catch(err => console.error(err));
        }
        catch (err) {
            console.error("Something went wrong!", err);
        }
    }
});

socket.on("newReaction", data => {

    console.log("API Server emitted newReaction", data);
    let msg_id = data.message;
    let reaction = data.data;

    if(reactionData[msg_id]) {
        console.log("Added new reaction to ", msg_id, "Reaction: ", reaction);
        reactionData[msg_id].reactions[reaction.emoji] = reaction.role;
    } else
        return;

    let guild = client.guilds.get(reactionData[msg_id].guild_id);
    let channel = guild.channels.get(reactionData[msg_id].channel_id);

    channel.fetchMessage(msg_id).then(msg => {
        msg.react(reaction.emoji).catch(err => console.error(err));
    }).catch(err => console.error(err));
});

socket.on("reactionEdit", data => {

    console.log("API server emitted reactionEdit", data);

    let msg_id = data.message;
    let newReaction = {role: data.data.newRole, emoji: data.data.newEmoji};
    let curEmoji = data.data.curEmoji;

    if(reactionData[msg_id]) {
        reactionData[msg_id].reactions[data.data.newEmoji] = newReaction;
    } else
        return;

    let guild = client.guilds.get(reactionData[msg_id].guild_id);
    let channel = guild.channels.get(reactionData[msg_id].channel_id);
    if(curEmoji !== data.data.newEmoji)
        channel.fetchMessage(msg_id).then(msg => {
            msg.react(data.data.newEmoji).catch(err => console.error(err));
            msg.reactions.forEach(reaction => {
                if(reaction.emoji.id === curEmoji)
                {
                    reaction.users.forEach(user => {
                        reaction.remove(user).catch(err => console.error(err));
                    });
                }
            });
        }).catch(err => console.error(err));
});

socket.on("reactionDelete", data => {

    console.log("API server emitted reactionDelete", data);

    let msg_id = data.message;
    let emoji = data.emoji;

    if(reactionData[msg_id]) {

        delete reactionData[msg_id].reactions[emoji];
        let guild = client.guilds.get(reactionData[msg_id].guild_id);
        let channel = guild.channels.get(reactionData[msg_id].channel_id);

        channel.fetchMessage(msg_id).then(msg => {

            msg.reactions.forEach(reaction => {
                if(reaction.emoji.id === emoji)
                    reaction.users.forEach(user => {
                        reaction.remove(user).catch(err => console.error(err));
                    });
            });
        }).catch(err => console.error(err));
    }
});

socket.on("messageDelete", data => {
    console.log("API server emitted messageDelete", data);
    let msg_id = data.message;
    if(reactionData[msg_id]) {

        let guild = client.guilds.get(reactionData[msg_id].guild_id);
        let channel = guild.channels.get(reactionData[msg_id].channel_id);

        channel.fetchMessage(msg_id).then(msg => {

            msg.reactions.forEach(reaction => {
                reaction.users.forEach(user => {
                    reaction.remove(user).catch(err => console.error(err));
                });
            });

            delete reactionData[msg_id];
        }).catch(err => console.error(err));
    }
});

socket.on("registerMessage", data => {

    console.log("API server emitted registerMessage", data);
    let msg_id = data.message;

    reactionData[msg_id] = {
        channel_id: data.channel,
        guild_id: data.guild,
        message: msg_id,
        reactions: {}
    };
});

socket.on("createMessage", data => {
    console.log("API server emitted createMessage", data);

    let guild = client.guilds.get(data.guild);
    let channel = guild.channels.get(data.channel);
    channel.send(data.contents).then(msg => {
        reactionData[msg.id] = {
            id: msg.id,
            guild_id: data.guild,
            channel_id: data.channel,
            reactions: {}
        };
        socket.emit("createMessage", {
            id: msg.id,
            author: {
                avatar: msg.author.avatar,
                discriminator: msg.author.discriminator,
                id: msg.author.id,
                username: msg.author.username
            },
            channel: data.channel,
            contents: data.contents,
            discReactions: {},
            embeds: [],
            reactions: {}
        });
    }).catch(err => console.error(err));
});

socket.on("messageEdit", data => {
    console.log("API server emitted messageEdit", data);
    if(!reactionData[data.message]) {
        socket.emit("messageEdit", {error: "No message exists with that ID"});
        return;
    }
    let guild = client.guilds.get(reactionData[data.message].guild_id);
    let channel = guild.channels.get(reactionData[data.message].channel_id);

    channel.fetchMessage(data.message).then(msg => {
        msg.edit(data.contents).then(() => {
            socket.emit("messageEdit", {success: "Success"});
        }).catch(err => {
            console.error(err);
            socket.emit("messageEdit", {error: "Could not edit the message."});
        });
    }).catch(err => {
        console.error(err);
        socket.emit("messageEdit", {error: "Could not find that message"});
    });
        

});