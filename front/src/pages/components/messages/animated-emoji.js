import React from 'react';

import UserMention from './user-mention';

const AnimatedEmoji = props => {

    let contents = [];
    // Match strings that are of the animated emoji format
    // <a:emoji_name:snowflake_id>
    let regex = props.str.match(/<a:[A-Za-z0-9]*:[0-9]*>/g);

    // Remaining input we have yet to parse
    let remainder = props.str;
    // If no matches, just return a span of this element
    if(regex === null)
        return <UserMention Users={props.Users} str={props.str}/>;
    else {

        // Split the text
        for(let i = 0; i < regex.length; i++)
        {
            if(remainder === undefined)
                break;
            // Our str we used to split
            let str = regex[i];
            // Split the remaining string by the regex match
            let expl = remainder.split(str);

            // Our id is the 3rd element in the array
            // As we split based on :
            // and the animated emoji is in the format of <a:emoji_name:snowflake_id>
            let id = str.split(":");

            id = id[2].substr(0, id[2].length-1);

            // If we have newlines we should also accordingly append line breaks
            let newlines = expl[0].split("\n");

            if(newlines.length > 1)
            {
                // Append spans with line breaks
                // 0 based element doesn't have a line break since \n appears after it
                if(newlines[0].length > 0)
                    contents.push(<UserMention Users={props.Users} key={`${i}animated${id}nlcont0`} str={newlines[0]}/>);
                for(let j = 1; j < newlines.length; j++)
                {
                    contents.push(<br key={`animated${id}nl${j}`}/>);
                    if(newlines[j].length > 0)
                        contents.push(<UserMention Users={props.Users} key={`animated${id}nlcont${j}`} str={newlines[j]}/>);
                }
            }
            else if(expl[0].length > 0) // No newlines, don't need to loop
                contents.push(<UserMention Users={props.Users} key={`animated${id}remainder${i}`} str={expl[0]}/>);

            // Append our animated gif
            contents.push(<img src={`https://cdn.discordapp.com/emojis/${id}.gif`} alt="" key={`${i}animated${id}emoji`} className="message-emoji"/>);
            // If we had more than 2 results from the split because there was duplicate emojis, we need to concatenate them back to remainder since we need to parse things in order of the RegEx occurences
            if(expl.length >= 3)
            {
                let concat = expl[1];

                for(let x = 2; x < expl.length; x++)
                {
                    concat += str;
                    concat += expl[x];
                }

                remainder = concat;
            } else
            {
                remainder = expl[1];
            }
        }
        // Push the remaining string to display as well
        contents.push(<UserMention Users={props.Users} key={`animatedemojiremainders`} str={remainder}/>);
    }

    return contents;

    
}
export default AnimatedEmoji;