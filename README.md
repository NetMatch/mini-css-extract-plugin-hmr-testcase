

## Repro steps

```
npm ci
npm start
```

Open at `http://localhost:8080` and open browser developer tools.
Use editor of choice and edit `main.less` file to introduce a syntax error.
E.g. add a plain `@` on a blank line.

Save and note the browser developer tools output:

```
[HMR] bundle rebuilding
[HMR] bundle rebuilt in (...)ms
[HMR] bundle has 1 errors
./styles/main.less
Module build failed (from ../node_modules/mini-css-extract-plugin/dist/loader.js):
ModuleBuildError: Module build failed (from ../node_modules/less-loader/dist/cjs.js):




}

@

^

Unrecognised input. Possibly missing something
```

Remove the error from the `main.less` file again.

Save and again note the browser developer tools output:

```
[HMR] bundle rebuilding
[HMR] bundle rebuilt in (...)ms
[HMR] Checking for updates on the server...

Ignored an update to unaccepted module ./scripts/index.js -> 0 process-update.js:20:13

Error: "Module build failed (from ../node_modules/mini-css-extract-plugin/dist/loader.js):
ModuleBuildError: Module build failed (from ../node_modules/less-loader/dist/cjs.js):




}

@

^

Unrecognised input. Possibly missing something

Ignored an error while updating module ./styles/main.less (self-accept-errored)
[HMR] The following modules couldn't be hot updated: (Full reload needed)
This is usually because the modules which have changed (and their parents) do not know how to hot reload themselves. See https://webpack.js.org/concepts/hot-module-replacement/ for more details.
HMR]  - css ../node_modules/css-loader/dist/cjs.js!../node_modules/less-loader/dist/cjs.js!./styles/main.less
[HMR]  - ./scripts/index.js
Ignored an update to unaccepted module ./scripts/index.js -> 0
Ignored an update to unaccepted module ./styles/main.less
[HMR] The following modules couldn't be hot updated: (Full reload needed)
This is usually because the modules which have changed (and their parents) do not know how to hot reload themselves. See https://webpack.js.org/concepts/hot-module-replacement/ for more details.
[HMR]  - ./scripts/index.js
[HMR]  - ./styles/main.less

[HMR] Reload all css
```


Any further change to the `main.less` file will result in the change no longer being picked up by HMR.



## Root cause

The root cause of the issue is that a module which fails to compile causes webpack to emit a simple module which only throws an error. E.g.

```js
throw new Error("Module build failed (from ../node_modules/mini-css-extract-plugin/dist/loader.js): (...)");
```

If a hot module receives such an attempted replacement module, it will throw immediately and will not set up a refreshed `hot.accept` binding.

## Making hot CSS modules error-resilient

MiniCssExtractPlugin uses a child compiler, which allows us to intercept
compilation errors in CSS and make hot reloaded CSS modules more error-resilient.

This requires a few small changes, which all boil down to ensuring a new
`hot.accept` binding is registered _before_ the auto-generated `throw new Error` would occur.

A forked version of the plugin, available [here](https://github.com/NetMatch/mini-css-extract-plugin/tree/hmr-error-recovery) applies these.


What follows is a short explanation of what it does, and how.


### Step 1
We start off by intercepting the `callback` in the plugin's `loader.js` and transform an error state into a normal state
where to output a source. We have that source throw _as if_ it was a module that suffered a compile error, but before it does,
we insert the hot loader snippet.

```js
const callback = !options.hmr
  ? this.async()
  : interceptError(this.async(), (err) => {
      let resultSource = `// extracted by ${pluginName}`;
      resultSource += hotLoader('', {
        context: this.context,
        locals: null,
        options,
      });
      resultSource += `\nthrow new Error(${JSON.stringify(String(err))});`;
      return resultSource;
    });
```

This takes care of re-registering the `hot.accept` binding, so that any subsequent compilation will remain capable of being accepted by the HMR client.


### Step 2

With that done, we need to ensure that when the `throw` occur in the hot loaded replacement module, the loader generates code that instructs the HMR client that we can _handle_ it, so that it doesn't let it leak out and trigger the path that requires a full reload.

We can do that by updating the hot loader template. It simply needs to register for its own acceptance, with an otherwise blank error handler: 
` module.hot.accept(function(){});`

```js
function hotLoader(content, context) {
  const accept = context.locals
    ? ''
    : 'module.hot.accept(undefined, cssReload);';

  return `${content}
    if(module.hot) {
      // ${Date.now()}
      var cssReload = require(${loaderUtils.stringifyRequest(
        context.context,
        path.join(__dirname, 'hmr/hotModuleReplacement.js')
      )})(module.id, ${JSON.stringify({
    ...context.options,
    locals: !!context.locals,
  })});
      module.hot.dispose(cssReload);
      module.hot.accept(function(){});
      ${accept}
    }
  `;
}
```

### Step 3

Finally, this will _almost_ work, except Webpack will lose track of dependencies in the child compiler, after the first error. That's because in the current versions of the loader, the dependencies are added for tracking _after_ checking the child compilation for errors. 

We need to move those to _before_ and we're done:

```js
childCompiler.runAsChild((err, entries, compilation) => {
  if (err) {
    return callback(err);
  }

  compilation.fileDependencies.forEach((dep) => {
    this.addDependency(dep);
  }, this);

  compilation.contextDependencies.forEach((dep) => {
    this.addContextDependency(dep);
  }, this);

  if (compilation.errors.length > 0) {
    return callback(compilation.errors[0]);
  }

  if (!source) {
    return callback(new Error("Didn't get a result from child compiler"));
  }

  // ()...)
```

(NOTE: Not sure if the dependencies should be moved to before the first category of critical system errors as well. From our own testing it _works_ but it's not strictly needed.)



## Trying it out

Run the NPM task to switch to the fixed fork:
```
npm run fix
```

Then try the above test scenario again.
Note that you will no longer see long lists of warnings regarding non-acceptance and that the module will resume to hot-reload passed any prior errors.

Want to switch back? Use
```
npm run unfix
```