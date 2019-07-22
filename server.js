const express = require( "express" );
const webpack = require( "webpack" );
const webpackDevMiddleware = require( "webpack-dev-middleware" );
const webpackHotMiddleware = require( "webpack-hot-middleware" );

const app = express();
const config = require( "./webpack.config.js" )();
const compiler = webpack(config);

// Tell express to use the webpack-dev-middleware and use the webpack.config.js
// configuration file as a base.
app
	.use(webpackDevMiddleware(compiler, {
		publicPath: config.output.publicPath
	}))
	.use(webpackHotMiddleware(compiler, {
		log: console.log, path: "/__webpack_hmr", heartbeat: 10e3
	}));

// Serve the files on port 8080.
app.listen(8080, function () {
	console.log('Example app listening on port 8080!\n');
});