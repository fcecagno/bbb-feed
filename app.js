/*
http://tbranyen.com/post/generating-rss-feeds-from-a-backbonejs-collection-in-nodejs
*/

var redis = require('redis');
var sys = require('sys');
var net = require('net');
var RSS = require('rss');
var xml2js = require('xml2js');
var Backbone = require('backbone');
var express = require('express');
var http = require('http');
var app = express();

var limit = 30;
var port = 3000;
var serverUrl = "http://143.54.10.215:" + port;

var Post = Backbone.Model.extend({
	idAttribute: "slug",

	initialize: function() {
		this.set({ slug: this.slugify() });
	},

	slugify: function(title) {
		return this.get("title").toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");
	}
});

var xmlParser = new xml2js.Parser();

var Posts = Backbone.Collection.extend({
	model: Post,

/*
	comparator: function(post) {
		return post.get("date");
	},
*/
	sync: function(method, model, options) {

	},
// <atom:link rel="hub" href="http://pubsubhubbub.appspot.com"/>
	initialize: function() {
		this.feed = new RSS({
			title: "BigBlueButton Events Feed",
			description: "This is the RSS Feed for all the events passing through Redis",
			feed_url: serverUrl + "/rss.xml",
			site_url: serverUrl,
			image_url: "https://lh6.googleusercontent.com/-Yy3PkhA5aIM/TrxTxnoqxkI/AAAAAAAAACw/D8IK2UEAmjE/s414/bbb_logo.jpg",
			author: "BigBlueButton",
		});
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
		title: channel + "-" + timestamp,
		description: message,
		date: timestamp,
		url: posts.feed.feed_url + "?id=" + title
	});

	//sys.debug(JSON.stringify(posts.feed.items));

	// limit maximum number of feeds
	if (posts.feed.items.length > limit)
		posts.feed.items.splice(0, 1);
});

sub.subscribe("bigbluebutton:meeting:participants");
sub.subscribe("bigbluebutton:meeting:system");
sub.subscribe("bigbluebutton:meeting:presentation");

app.get("/rss.xml", function(req, res) {
	res.contentType("rss");
	res.send(posts.feed.xml());
});

app.use(function(err, req, res, next){
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.listen(port);
console.log('Listening on port ' + port);
