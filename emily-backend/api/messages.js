const express = require("express");

const { GetUserTokens } = require("./oauth2");

const { CatchAsync, DiscordGet, ValidateSnowflake } = require("../utils");

const { SocketEmit, SocketHasConnection } = require("./bot");

const router = express.Router();

const msgs = require("../schemas/reaction_message");

// Get all registered reactions
router.get("/all", CatchAsync(async (req, res) => {

    let allMessages = await msgs.find();

    res.status(200).json(allMessages || {});

}));
// Get all guild information for messages module
// All registered reactions from Mongoose
// Message information for the messages
// Role information
router.get("/guild/:id", CatchAsync(async (req, res) => {

    
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }

    let id = req.params.id;

    // Get Channels of the Guild
    let channels = await DiscordGet(`https://discordapp.com/api/guilds/${id}/channels`);
    if(typeof(channels) !== "object") {
        res.status(channels).json({error: "The bot is not in this selected guild"});
        return;
    }
    // Get Roles of the Guild
    // Deprecated, discord/guild/:id returns an array of Role objects
    /*let roles = await DiscordGet(`https://discordapp.com/api/guilds/${id}/roles`);
    if(typeof(roles) !== "object") {
        res.sendStatus(channels);
        return;
    }*/
    // Get from MongoDB
    let messages = await msgs.find({guild: id}).exec();
    // Loop through registered messages and get their message contents and etc from Discord API
    let messageObj = {};
    if(messages.length > 0) {

        for(let i = 0; i < messages.length; i++) {

            const msg = await DiscordGet(`https://discordapp.com/api/channels/${messages[i].channel}/messages/${messages[i].message}`);

            if(typeof(msg) !== "object")
            {
                console.error(`Message ${messages[i].message} discord fetch failed. Status code ${msg}`);
                continue;
            }
            
            let reacts = {};
            // Current Message Reactions and their count
            if(msg.reactions && msg.reactions.length > 0) {
                for(let j = 0; j < msg.reactions.length; j++) {
                    reacts[msg.reactions[j].emoji.id] = msg.reactions[j].count;
                }
            }

            messageObj[messages[i].message] = {
                attachments: msg.attachments,
                embeds: msg.embeds,
                contents: msg.content,
                author: msg.author,
                id: msg.id,
                channel: msg.channel_id,
                reactions: messages[i].reactions, // The reactions that are registered to this message from our Bot
                discReactions: reacts
            };

        }


    }
    // Loop through roles and have it as a Map instead
    /*let roleObj = {};
    for(let i = 0; i < roles.length; i++)
    {
        roleObj[roles[i].id] = {
            id: roles[i].id,
            permissions: roles[i].permissions,
            color: roles[i].color,
            name: roles[i].name
        };
    }*/
    // Loop through channels and remove the ones that are a voice channel
    let chObj = {};
    for(let i = 0; i < channels.length; i++)
    {
        if(channels[i].type === 0)
            chObj[channels[i].id] = {
                id: channels[i].id,
                name: channels[i].name
            };
    }

    res.status(200).json({
        //Roles: roleObj,
        Channels: chObj,
        Messages: messageObj
    });

    
}));



// Register an already created message for reaction roles!
router.post("/guild/:id/register", CatchAsync(async (req, res) => {

    
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }

    let guild_id = req.params.id;
    let channel_id = req.body.channel_id;
    let message_id = req.body.message_id;

    if(!ValidateSnowflake(guild_id) || !ValidateSnowflake(channel_id) || !ValidateSnowflake(message_id))
    {
        res.sendStatus(400);
        return;
    }

    // Insert into document
    let data = {message: message_id, channel: channel_id, guild: guild_id, reactions: []};
    let msg = new msgs(data);
    
    let newMessage = await msg.save();

    res.status(201).json(newMessage);

    // Also let the bots know
    SocketEmit("registerMessage", data);

}));

// Create a new message for reaction roles
router.post("/guild/:id/channels/:channel_id/create", CatchAsync(async (req, res) => {
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }

    let guild_id = req.params.id;
    let channel_id = req.params.channel_id;
    let contents = req.body.contents;

    if(!ValidateSnowflake(guild_id) || !ValidateSnowflake(channel_id) || contents === undefined || typeof(contents) !== "string")
    {
        res.sendStatus(400);
        return;
    }

    let data = {contents: contents, guild: guild_id, channel: channel_id};
    // Emit a create response and insert into MongoDB once the bot responds with the created message id

    SocketEmit("createMessage", data, reply => {
        // Reply is the data!
        console.log("Received createMessage emit from Bot", reply);
        let newObj = {
            guild: guild_id,
            channel: channel_id,
            message: reply.id,
            reactions: []
        };

        let msg = new msgs(newObj);
        msg.save((err) => {
            if(err) {
                console.error("There was an error", err);
                return res.status(500).send(err);
            }

            res.status(201).json(reply);
        });
    });
}));

// Create a new reaction on a message
router.post("/message/:message_id/reaction/create", CatchAsync(async (req, res) => {
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }

    if(!SocketHasConnection())
    {
        res.status(500).send("Bot is offline");
        return;
    }

    let message_id = req.params.message_id;
    let role = req.body.role;
    let emoji = req.body.emoji;

    if(!ValidateSnowflake([message_id, role, emoji]))
    {
        res.sendStatus(400);
        return;
    }

    // Create a new reaction

    let msg = await msgs.findOneAndUpdate({message: message_id}, {$addToSet: {reactions: {emoji: emoji, role: role}}}, {new: true});

    if(!msg) {
        res.status(404).send("Message is not registered");
    } else {
        res.status(200).send(msg);

        // Also emit to bots
        SocketEmit("newReaction", {message: message_id, data: {emoji: emoji, role: role}});
    }

}));
// Update a reaction on a message
router.put("/message/:message_id/reaction/:id", CatchAsync(async (req, res) => {
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }
    let message_id = req.params.message_id;
    let currentEmoji = req.params.id;
    let newRole = req.body.newRole;
    let newEmoji = req.body.newEmoji;

    if(!ValidateSnowflake([message_id, currentEmoji, newRole, newEmoji])) {
        res.sendStatus(400);
        return;
    }

    let msg = await msgs.findOneAndUpdate({message: message_id, 'reactions.emoji': currentEmoji}, {$set: { 'reactions.$.emoji': newEmoji, 'reactions.$.role': newRole}}, {new: true});

    if(!msg) {
        res.status(404).send("Could not find a document with that Emoji or Message ID.");
    } else {
        res.status(200).send(msg);

        // Also emit to bots

        SocketEmit("reactionEdit", {message: message_id, data: {curEmoji: currentEmoji, newRole: newRole, newEmoji: newEmoji}});
    }

}));

// Delete a reaction on a message
router.delete("/message/:message_id/reaction/:id", CatchAsync(async (req, res) => {
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }
    let message_id = req.params.message_id;
    let emoji = req.params.id;

    if(!ValidateSnowflake([message_id, emoji]))
    {
        res.sendStatus(400);
        return;
    }

    let msg = await msgs.findOneAndUpdate({message: message_id}, {$pull: {reactions: {emoji: emoji}}}, {multi: true, new: true});

    if(!msg) {
        res.status(404).send("Could not find a document with that Message ID.");
    } else {
        res.status(200).json(msg);

        // Also emit
        SocketEmit("reactionDelete", {message: message_id, emoji: emoji});
    }
}));

// Delete a message
router.delete("/message/:message_id", CatchAsync(async (req, res) => {
    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }

    if(!SocketHasConnection())
    {
        res.status(500).send("Bot is offline");
        return;
    }
    let message_id = req.params.message_id;

    if(!ValidateSnowflake(message_id)) {
        res.sendStatus(400);
        return;
    }

    let msg = await msgs.findOneAndDelete({message: message_id});

    if(!msg) {
        res.status(404).send("Could not find a document with that Message ID.");
    } else {
        res.status(200).json(msg);

        // Also emit to bots

        SocketEmit("messageDelete", {message: message_id});
    }
}));

router.put("/message/:message_id/edit", CatchAsync(async (req, res) => {

    if(!await GetUserTokens(req, res)) {
        res.sendStatus(401);
        return;
    }
    if(!SocketHasConnection())
    {
        res.status(500).send("Bot is offline");
        return;
    }

    let message_id = req.params.message_id;
    let contents = req.body.contents;

    if(!contents)
    {
        res.sendStatus(500);
        return;
    }

    if(!ValidateSnowflake(message_id)) {
        res.sendStatus(400);
        return;
    }

    // Socket emit

    SocketEmit("messageEdit", {contents: contents, message: message_id}, (reply) => {
        if(reply.success !== undefined)
        {
            res.sendStatus(200);
        }
        else
        {
            res.status(500).send(reply.error);
        }
    });
}));
// Test
router.get("/test_create/:message_id/:role_id/:emoji", CatchAsync(async (req, res) => {

    
    let message_id = req.params.message_id;
    let role = req.params.role_id;
    let emoji = req.params.emoji;

    if(!ValidateSnowflake([message_id, role, emoji]))
    {
        res.sendStatus(400);
        return;
    }

 
    let msg = await msgs.findOneAndUpdate({message: message_id}, {$addToSet: {reactions: {emoji: emoji, role: role}}}, {new: true});

    if(!msg) {
        res.status(404).send("Message is not registered");
    } else {
        res.status(200).send(msg);
    }
}));

router.delete("/message/:message_id/bot", CatchAsync(async (req, res) => {
    if(process.env.BOT_TOKEN !== req.headers.authorization)
    {
        res.sendStatus(401);
    }

    msgs.findOneAndDelete({message: req.params.message_id});
    console.log("Bot send delete request for message", req.params.message_id);

    res.sendStatus(200);
}));

router.delete("/guild/:guild_id/channel/:channel_id", CatchAsync(async (req, res) => {

    if(process.env.BOT_TOKEN !== req.headers.authorization)
    {
        res.sendStatus(401);
    }

    console.log("Bot send delete request for channel", req.params.channel_id, "in guild", req.params.guild_id);

    msgs.deleteMany({channel: req.params.channel_id, guild: req.params.guild_id}, err => {
        if(err)
        {
            console.error("Error deleteMany for channel", req.params.channel_id, "in guild", req.params.guild_id, err);
        }
    });

    res.sendStatus(200);
}));

router.delete("/guild/:guild_id", CatchAsync(async (req, res) => {

    if(process.env.BOT_TOKEN !== req.headers.authorization)
    {
        res.sendStatus(401);
    }

    console.log("Bot send delete request for guild", req.params.guild_id);

    msgs.deleteMany({channel: req.params.guild_id}, err => {
        if(err)
        {
            console.error("Error deleteMany for guild", req.params.guild_id, err);
        }
    });
    res.sendStatus(200);
}));
router.get("*", (req, res) => res.sendStatus(404));

module.exports = router;