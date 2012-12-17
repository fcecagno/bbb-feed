/*
http://tbranyen.com/post/generating-rss-feeds-from-a-backbonejs-collection-in-nodejs
*/

var redis = require('redis');
var ATOM = require('atom');
var Backbone = require('backbone');
var express = require('express');

var limit = 50;
var port = 3000;
var app = express();

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
			hub_url: "http://pubsubhubbub.appspot.com"
		});
	},

	invalidateCache: function() {
		this.cache = null;
	},

	xml: function() {
		if (this.cache === null)
			this.cache = this.feed.xml(true);
		return this.cache;
	}
});

var posts = new Posts();
var sub = redis.createClient();

sub.on("error", function(err) {
	sys.debug("onError: " + err);
});

sub.on("subscribe", function(channel, count) {
});

sub.on("message", function(channel, message) {
	var timestamp = new Date().getTime();
	var title = channel + "-" + timestamp;

	posts.feed.item({
		title: title,
		author: channel,
		description: message,
		updated: timestamp,
		url: "/rss.xml?id=" + title
	});
	posts.invalidateCache();
	//console.log(JSON.stringify(posts.feed.items));

	// limit maximum number of feeds
	if (posts.feed.items.length > limit)
		posts.feed.items.splice(0, 1);
});

sub.subscribe("bigbluebutton:meeting:participants");
sub.subscribe("bigbluebutton:meeting:system");
//sub.subscribe("bigbluebutton:meeting:presentation");

app.get("/rss.xml", function(req, res) {

	if (posts.feed.feed_url === undefined) {
		posts.feed.site_url = "http://" + req['headers']['host'];
		posts.feed.feed_url = "http://" + req['headers']['host'] + "/rss.xml";
	}

	res.contentType("atom");
	res.send(posts.xml());
});

app.use(function(err, req, res, next){
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.listen(port);
console.log('Listening on port ' + port);
