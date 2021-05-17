const http = require('http');
const _ = require('lodash');
const moment = require('moment');
const { exec } = require('child_process');
const axios = require('axios');
const Pushover = require('pushover-notifications');
const jp = require('jsonpath');
require('dotenv').config();

let states = new Map();

let push = new Pushover({
    token: process.env.PUSHOVER_TOKEN,
    user: process.env.PUSHOVER_USER
});

// Create an instance of the http server to handle HTTP requests
let app = http.createServer((req, res) => {
    // Set a response type of plain text for the response
    res.writeHead(200, {'Content-Type': 'text/plain'});

    // Send back a response and end the connection
    res.end('Hi from api-hanger!\n');
});

// Start the server on port 3000
app.listen(process.env.PORT);
console.log('Node server running on port ' + process.env.PORT);

async function checkBookings(yearMonth) {
    console.log(`${moment()} checking ${yearMonth}`);
    return await axios.post(
        'https://cliffhangerclimbing.com/core/wp-admin/admin-ajax.php',
        `action=cliffhanger&method=events__find_available&request=${moment().valueOf()}&session=mbc&date=${yearMonth}`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
        })
    .then((response) => {
        parseResponse(response.data);
    });
}

function parseResponse(response) {
    //console.log(JSON.stringify(response));

    for (const dateString in response.calendar) {
        const date = moment(dateString);
        const isWeekend = (date.weekday() === 6) || (date.weekday() === 0);

        if (date.isBefore(moment().startOf('day'))) continue;
        if (isWeekend) continue;

        for (const timeString in response.calendar[dateString]) {
            if (timeString === '18:00:00' || timeString === '20:30:00') {
                const edge = jp.query(response.calendar[dateString][timeString], '$..*');
                const availableSpots = edge[0].open;
                const openSpots = edge[0].size;
                const eventId = edge[0].event_id;
                if (availableSpots > 0 && openSpots > 0 && !states.has(eventId)) {
                    console.log(`${moment()} adding ${eventId} to ${states}`);
                    states.set(eventId);
                    console.log(`${moment()} ${dateString} ${timeString}: ${availableSpots} remaining [${eventId}]`);
                    desktopNotification(dateString, timeString, availableSpots);
                    pushNotification(dateString, timeString, availableSpots);
                } else if ((availableSpots <= 0 || openSpots <= 0) && states.has(eventId)) {
                    console.log(`${moment()} removing ${eventId} from ${states}`);
                    states.delete(eventId);
                }
            }
        }
    }
}

function isWeekday(date) {
    return !(moment(date).weekday() === 6 || moment(date).weekday() === 0);
}

function parseResponseFunctional(response) {
    let filtered = _(response.calendar)
    .pickBy((value, key) => isWeekday(key))
    .map(function (value, key, object) {
        // key 2020-03-01
        return _(value).pickBy((value, key) => jp.query(value, '$.."18:00:00"*'))
        .value();
    })
    .value();

    //     .pickBy((value, key) => (key === '18:00:00' || key === '20:30:00'))
    console.log(filtered);
}

function desktopNotification(dateString, timeString, openSpots) {
    exec(`osascript -e 'display notification "${dateString} ${timeString}: ${openSpots} remaining" with title "Cliffhanger Booking Available"'`);
}

function pushNotification(dateString, timeString, openSpots) {
    push.send({
        message: `${dateString} ${timeString}: ${openSpots} remaining`,
        title: "Cliffhanger Booking Available"
    });
}

function test() {
    const curYearMonth = moment().format('YYYY-MM');
    const nextYearMonth = moment().add(1, 'M').format('YYYY-MM');
    checkBookings(curYearMonth);
    checkBookings(nextYearMonth);
    pushNotification("test", "test", "test");

    axios.get('http://api-hanger.herokuapp.com')
    .then(function (response) {
        console.log('keepalive: ' + response.data);
      })
    .catch(function (error) {
        console.log('keepalive error: ' + error.message);
    });
    /*console.log(`${moment()} self-test`);
    const testResponse = require('./testResponse.json');
    const testResponse2 = require('./testResponse2.json');
*/
    //parseResponseFunctional(testResponse);
/*
    // should send just once
    console.log(`${moment()} First parse - notification`);
    parseResponse(testResponse);
    console.log(`${moment()} Second parse - no notification`);
    parseResponse(testResponse);

    // delete with openspots = 0
    console.log(`${moment()} Third parse - no notification, reset`);
    parseResponse(testResponse2);
    // now send again
    console.log(`${moment()} Fourth parse - notification again`);
    parseResponse(testResponse);*/
}

setInterval(function() {
    const curYearMonth = moment().format('YYYY-MM');
    const nextYearMonth = moment().add(1, 'M').format('YYYY-MM');

    if (moment().hours() >= 7 && moment().hours() <= 21) {
        checkBookings(curYearMonth);
        checkBookings(nextYearMonth);
    } else {
        console.log(`${moment()} it's sleepy time, skipping`);
    }

    axios.get('http://api-hanger.herokuapp.com')
    .then(function (response) {
        console.log('keepalive: ' + response.data);
      })
    .catch(function (error) {
        console.log('keepalive error: ' + error.message);
    });
}, 5*60*1000);

console.log(`${moment()} Checking Cliffhanger for bookings. Interval is 5 minutes.`);

test();

