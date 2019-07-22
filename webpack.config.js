const path = require( "path" );
const { HotModuleReplacementPlugin } = require( "webpack" );
const MiniCssExtractPlugin = require( "mini-css-extract-plugin" );
const HtmlWebpackPlugin = require( "html-webpack-plugin" );
const { CleanWebpackPlugin } = require( "clean-webpack-plugin" );

module.exports = env => {
	return {
		mode   : "development",
		output : {
			path          : path.resolve( "./dist" ),
			publicPath    : "/",
			filename      : `scripts/[name].js`,
			chunkFilename : `scripts/[name].js`
		},

		context : path.resolve( "./src" ),
		entry   : {
			"index" : [
				"./scripts/index.js",
				"webpack-hot-middleware/client?path=/__webpack_hmr&timeout=20000"
			]
		},
		devServer : {
			contentBase : "./dist"
		},
		
		optimization : {
			namedModules : true
		},

		module : {
			rules : [{
				test : /\.less$/i,
				use  : [{
					loader  : MiniCssExtractPlugin.loader,
					options : { hmr : true }
				}, {
					loader  : "css-loader"
				}, {
					loader  : "less-loader",
				}]
			}]
		},
		
		plugins : [
			new HotModuleReplacementPlugin(),
			new CleanWebpackPlugin(),
			new MiniCssExtractPlugin({
				filename      : `styles/[name].css`,
				chunkFilename : `styles/[name].css`
			}),
			new HtmlWebpackPlugin()
		]
	}
}