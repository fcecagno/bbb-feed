// http://tbranyen.com/post/generating-rss-feeds-from-a-backbonejs-collection-in-nodejs

var redis = require('redis');
var ATOM = require('atom');
var Backbone = require('backbone');
var express = require('express');
var QueryString = require('querystring');
var http = require('http');
var URL = require('url');

var limit = 50;
var port = 3000;
var app = express();
var serverUrl = null;
var serverUrlChecked = false;

// http://stackoverflow.com/a/8440736/1006288
var os = require('os');
var ifaces = os.networkInterfaces();
for (var dev in ifaces) {
	ifaces[dev].forEach(function(details){
		//console.log(JSON.stringify(details));
		if (details.family == 'IPv4' && !details.internal)
			serverUrl = details.address;
	});
}

var Post = Backbone.Model.extend({
	idAttribute: "slug",

	initialize: function() {
		this.set({ slug: this.slugify() });
	},

	slugify: function(title) {
		return this.get("title").toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");
	}
});

var Posts = Backbone.Collection.extend({
	model: Post,
	cache: null,

	sync: function(method, model, options) {

	},

	initialize: function() {
		this.feed = new ATOM({
			title: "BigBlueButton Events Feed",
			description: "This is the RSS Feed for all the events passing through Redis",
			image_url: "https://lh6.googleusercontent.com/-Yy3PkhA5aIM/TrxTxnoqxkI/AAAAAAAAACw/D8IK2UEAmjE/s414/bbb_logo.jpg",
			author: "BigBlueButton",
//			hub_url: "http://pubsubhubbub.appspot.com",
			limit: limit
		});
		this.setFeedUrl(serverUrl);
	},

	invalidateCache: function() {
		this.cache = null;
	},

	xml: function() {
		if (this.cache === null)
			this.cache = this.feed.xml(true);
		return this.cache;
	},

	publishToHub: function(feed_url) {
		if (this.feed.hub_url === undefined)
			return;

		// http://stackoverflow.com/questions/6158933/http-post-request-in-node-js
		var post_data = QueryString.stringify({
			'hub.mode': 'publish',
			'hub.url': feed_url
		});

		console.log(post_data);

		var req_url = URL.parse(this.feed.hub_url);
//		var req_url = URL.parse('http://posttestserver.com/post.php?dir=bbb-feed');

		var post_options = {
			host: req_url.hostname,
			path: req_url.path,
			port: req_url.port || '80',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': post_data.length
			}
		};

		var post_req = http.request(post_options, function(res) {
			res.setEncoding('utf8');
			res.on('data', function(chunk) {
				console.log('POST response: ' + chunk);
			});
			res.on('error', function(error) {
				console.log('POST error: ' + error);
			})
		});

		post_req.write(post_data);
		post_req.end();
	},

	setItemUrl: function(item) {
		if (this.feed.site_url !== undefined)
			item.url = this.feed.site_url + "/feed/" + item.title + ".xml";
	},

	setFeedUrl: function(serverAddress) {
		this.feed.site_url = "http://" + serverAddress;
		this.feed.feed_url = "http://" + serverAddress + "/feed/all.xml";
		this.feed.items.forEach(function(item) {
			posts.setItemUrl(item);
			posts.publishToHub(item.url);
		});
	}
});

var posts = new Posts();
var sub = redis.createClient();

sub.on("error", function(err) {
	sys.debug("onError: " + err);
});

sub.on("subscribe", function(channel, count) {
	console.log("Subscribed to " + channel);
});

sub.on("message", function(channel, message) {
	var timestamp = new Date().getTime();
	var title = channel + "-" + timestamp;

	var item = posts.feed.item({
		title: title,
		author: channel,
		description: message,
		updated: timestamp
	});
	posts.setItemUrl(item);
	//console.log(JSON.stringify(item));

	posts.invalidateCache();
	posts.publishToHub(item.url);
});

sub.subscribe("bigbluebutton:meeting:participants");
sub.subscribe("bigbluebutton:meeting:system");
//sub.subscribe("bigbluebutton:meeting:presentation");

app.get("/feed/*", function(req, res) {
	if (!serverUrlChecked) {
		var req_url = URL.parse("http://" + req.headers.host);
		//console.log(req_url);
		if (serverUrl !== req_url.hostname) {
			console.log("Resetting the serverUrl");
			serverUrl = req_url.hostname;
			posts.setFeedUrl(serverUrl);
		}
		serverUrlChecked = true;
	}

	if (req['_parsedUrl']['pathname'] === '/feed/all.xml') {
		res.contentType("atom");
		res.send(posts.xml());
	} else {
		var success = false;
		posts.feed.items.forEach(function(item) {
			if (item.url == posts.feed.site_url + req['_parsedUrl']['pathname']) {
				res.contentType("atom");
				res.send(posts.feed.xml(true, item));
				success = true;
			}
		});

		if (!success) {
			res.contentType("text");
			res.send("Cannot GET " + req['_parsedUrl']['pathname']);
		}
	}
});

app.use(function(err, req, res, next){
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.listen(port);

console.log('Listening on port ' + port);

