// Imports
const del = require("del");
const gulp = require("gulp");
const path = require("path");
const rev = require("gulp-rev");
const open = require("gulp-open");
const gutil = require("gulp-util");
const uncss = require("gulp-uncss");
const nano = require("gulp-cssnano");
const concat = require("gulp-concat");
const eslint = require("gulp-eslint");
const inject = require("gulp-inject");
const notify = require("gulp-notify");
const uglify = require("gulp-uglify");
const rename = require("gulp-rename");
const connect = require("gulp-connect");
const webpack = require("webpack-stream");
const filesize = require("gulp-filesize");
const runSequence = require("run-sequence");
const livereload = require("gulp-livereload");

// URI of the dev server
const devServerURI = "http://localhost:8080";

// Input sources globs. Keys should have 1-to-1 mapping with build:* commands.
const sources = {
  index: "src/index.html",
  js: "src/js/app.js",
  css: ["src/vendor/css/*.css", "src/css/*.css"],
  images: "src/images/*.+(png|jpg|gif|svg)",
};

// Output directories/files
const outputsRoot = path.join(__dirname, "build");

const outputs = {
  index: "index.html",
  js: "app.min.js",
  css: "style.min.css",
  images: path.join(outputsRoot, "images"),
};

// The image to use for growl notifications
const obIconSource = path.join(outputs.images, "favicon.png");

//
// Conveniece composed tasks
//

gulp.task("default", ["dev"]);

gulp.task("dev", ["build"], function (done) {
  runSequence(
    "watch", "server:start", "notify:server:start", done
  );
});

gulp.task("build", function (done) {
  runSequence(
    "clean", ["build:js", "build:css", "build:images"], "build:index", done
  );
});

gulp.task("clean", function (done) {
  runSequence(
    ["clean:js", "clean:css", "clean:images", "clean:index"], done
  );
});

//
// Clean tasks
//

gulp.task("clean:js", function (done) {
  del.sync(path.join(outputsRoot, "**/*.js")) && done();
});

gulp.task("clean:css", function (done) {
  del.sync(path.join(outputsRoot, "**/*.css")) && done();
});

gulp.task("clean:images", function (done) {
  del.sync(path.join(outputs.images)) && done();
});

gulp.task("clean:index", function (done) {
  del.sync(path.join(outputs.index)) && done();
});

//
// Build tasks
//
gulp.task("build:images", function () {
  gulp.src(sources.images).pipe(gulp.dest(outputs.images));
});

gulp.task("build:css", function () {
  return gulp
    .src(sources.css)
    .pipe(concat(outputs.css))
    .pipe(uncss({ html: [sources.index] }))
    .pipe(nano())
    .pipe(rev())
    .pipe(filesize())
    .pipe(gulp.dest(outputsRoot))
    .on("error", gutil.log);
});

gulp.task("build:js", function (done) {
  return gulp
    .src(sources.js)
    .pipe(webpack({
      entry: path.join(__dirname, sources.js),
      output: {
        path: outputsRoot,
        filename: outputs.js
      },
      module: {
        loaders: [
          {
            test: /\.js$/,
            loader: "babel-loader?cacheDirectory",
            include: [
              path.resolve(__dirname, "src/js"),
              path.resolve(__dirname, "node_modules/jquery/dist"),
              path.resolve(__dirname, "node_modules/bip39"),
            ]
          }
        ]
      },
    }))
    // .pipe(uglify())
    .pipe(rev())
    .pipe(filesize())
    .on("complete", done)
    .on("error", gutil.log)
    .pipe(gulp.dest(outputsRoot));
});

gulp.task("build:index", function () {
  var assetSources = gulp.src(path.join(outputsRoot, "*.min.+(js|css)"), { read: false, cwd: outputsRoot });

  return gulp.src(sources.index)
    .pipe(inject(assetSources))
    .pipe(gulp.dest(outputsRoot))
    .pipe(livereload());
});

//
// Notifications
//

gulp.task("notify:complete", function () {
  gulp.src("").pipe(notify(notifyOpts({ message: "Build Updated" })));
});

gulp.task("notify:server:start", function () {
  gulp.src("").pipe(notify(notifyOpts({
    open: devServerURI,
    subtitle: "Server started",
    message: "Listening on " + devServerURI,
  })));
});

function notifyOpts(opts) {
  opts.sound = "Pop";
  opts.onLast = true;
  opts.title = "EasyBazaar";
  opts.contentImage = obIconSource;
  return opts;
}

//
// Development server
//

// Start dev server with livereload
gulp.task("server:start", ["watch"], function (done) {
  // Start dev server
  connect.server({
    root: outputsRoot,
    livereload: true
  });

  livereload.listen();
  done();
});

// Open browser to app
gulp.task("server:open", ["serve"], function () {
  gulp.src(sources.index).pipe(open({ uri: devServerURI }));
});

//
// Change watches
//

gulp.task("watch", function (done) {
  Object.keys(sources).forEach(function (name, i, allNames) {
    gulp.watch(sources[name], function () {
      runSequence("clean:" + name, "build:" + name, "build:index", "notify:complete");
    });

    if (i == (allNames.length - 1)) done();
  });
});
