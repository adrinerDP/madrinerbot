'use strict';

require('dotenv').config();
const request = require('sync-request');
const moment = require('moment');
const numberToWords = require('number-to-words');
const { wordsToNumbers } = require('words-to-numbers');
const emoji = require('node-emoji');
const redis = require('redis');
const Discord = require('discord.js');

const client = new Discord.Client();
const redisClient = redis.createClient();
const log = require('ololog').configure({
    tag: true,
    locate: false,
    time: true
});
moment.locale('ko');

let carriers = [{"id": "kr.cvsnet","name": "GS Postbox 택배","tel": "+8215771287"},{"id": "kr.epost", "name": "우체국 택배", "tel": "+8215881300"}];

redisClient.on("error", function(error) {
    log.error('REDIS Error')
});

client.on('ready', () => {
    log.info(`Starting Bot Listener - ${client.user.tag}`);
    log.info(`Updating carriers list data`);
    carriers = getCarrier();
    log.info(`Completed updating ${carriers.length} carriers list`);
})

client.on('message', message => {
    if (!message.content.startsWith(process.env.BOT_PREFIX)) return;
    const args = message.content.slice(process.env.BOT_PREFIX.length).trim().split(' ');
    const command = args.shift().toLowerCase();
    switch (command) {
        case 'parcel':
            let results = [];
            log.info(`[PARCEL] ${message.author.tag} | ${args[0]}`);
            message.channel.send(`:package: ${carriers.length}개 택배사를 조회할거에요. 잠깐 기다려주세요!`).then((msg) => {
                carriers.forEach(value => {
                    msg.edit(`:mag_right: 지금 \`${value.name}\`에서 조회하고 있어요!`).then(() => {
                        let track_data = getParcel(value.id, args[0]);
                        if (track_data !== false) {
                            results[results.length] = track_data;
                        }
                    });
                });
                msg.delete().then(() => {
                    redisClient.set(message.author.id, JSON.stringify(results));
                    message.channel.send(`:white_check_mark: ${carriers.length}개 택배사 중에 ${results.length}개를 발견했어요!\n아래 버튼을 눌러 해당 택배사의 결과를 조회하세요!\n\n${setSuccessParcels(results)}`).then(msg => {
                        log.info(`[PARCEL] ${message.author.tag} | OK | ${results.length} items`);
                        results.forEach((value, index) => {
                            msg.react(`${emoji.get(numberToWords.toWords(index + 1))}`);
                        })
                    });
                });
            });
        default:
            break;
    }
});

client.on('messageReactionAdd', (reaction, user) => {
    const selectedIndex = wordsToNumbers(emoji.find(reaction.emoji.name).key) - 1;
    redisClient.get(user.id, (err, reply) => {
        const data = JSON.parse(reply);
        if (data == null) {
            return;
        }
        reaction.message.channel.send(getParcelDetails(data[selectedIndex]));
    });
});

function getParcelDetails(detail) {
    const parcelEmbed = new Discord.MessageEmbed()
        .setColor('#009688')
        .setTitle(`${detail.carrier.name} 조회 결과`)
        .setDescription(`현재 상태: ${detail.state.text}`)
        .setFooter('매드라이너 택배 정보', 'https://cdn.discordapp.com/avatars/761122456181538827/d05e24447e218561f0c3a9bd79b8a6d2.png?size=128')
        .setTimestamp()
        .addFields(
            {name: '보내신 분', value: detail.from.name, inline: true},
            {name: '받는 분', value: detail.to.name, inline: true},
        );
    detail.progresses.forEach(data => {
        parcelEmbed.addField(data.location.name, `${data.status.text} | ${moment(data.time).format('lll')}`)
    })
    return parcelEmbed;
}

function setSuccessParcels(results) {
    let string = '';
    results.forEach((value, index) => {
        string += `:${numberToWords.toWords(index + 1)}: ${value.carrier.name}\n`;
    })
    return string;
}

function getCarrier() {
    let response = request('GET', 'https://apis.tracker.delivery/carriers');
    return JSON.parse(response.getBody());
}

function getParcel(carrier, track_id) {
    try {
        let response = request('GET', `https://apis.tracker.delivery/carriers/${carrier}/tracks/${track_id}`, {
            timeout: 1500
        });
        return JSON.parse(response.getBody());
    } catch (e) {
        return false;
    }
}

client.login(process.env.BOT_TOKEN);