import React, { Component } from 'react';

import { Link } from 'react-router-dom';

import { connect } from 'react-redux';
class GuildList extends Component {
    render() {

        if(!this.props.Guilds)
            throw new Error("GuildList was not passed a Guilds prop");
        let contents = [];
        for(let i = 0; i < this.props.Guilds.length; i++)
        {
            let avatar;
            let perms = (this.props.Guilds[i].permissions & 0x00000008) === 0x00000008;
            if(this.props.Guilds[i].icon !== null)
                avatar = <img alt="?" className="dashboard-list-avatar circular" src={`https://cdn.discordapp.com/icons/${this.props.Guilds[i].id}/${this.props.Guilds[i].icon}.png`}/>
            else
                avatar = <div className="dashboard-list-avatar circular">{this.props.Guilds[i].name.substr(0,1)}</div>
            let element = <Link to={`/dashboard/guild/${this.props.Guilds[i].id}`} onClick={() => {
                    this.props.dispatch({type: "GUILD_SELECTED", data: i});
                }} className={perms ? "dashboard-selection" : "dashboard-selection-noperms"} key={`guild${i}`}>
                {avatar}
                <span>
                    {this.props.Guilds[i].name}
                </span>
            
            </Link>
            contents.push(element);
        }
        return contents;
    }
}

export default connect(() => {return {};})(GuildList);