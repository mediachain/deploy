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
const connect = require("gulp-connect");
const filesize = require("gulp-filesize");
const runSequence = require("run-sequence");
const livereload = require("gulp-livereload");

// URI of the dev server
const devServerURI = "http://localhost:8080";

// Input sources globs
const sources = {
  index: "src/index.html",
  js: "src/assets/**/*.js",
  css: "src/assets/**/*.css",
  images: "src/assets/images/**/*"
};

// Output directories
const buildDir = path.join(__dirname, "build");
const assetsBuildDir = path.join(buildDir, "assets");
const imagesBuildDir = path.join(assetsBuildDir, "images");

// Build tasks
gulp.task("default", ["build"]);
gulp.task("build", function (done) {
  runSequence(
    "clean", ["js", "css", "images"], "index", "notifyCompletion", done
  );
});

gulp.task("dev", function (done) {
  runSequence(
    "clean", ["js", "css", "images"], "index", "notifyCompletion", "watch", "serve", "notifyServerStarted", done
  );
});

gulp.task("clean", function () {
  return del.sync(path.join(buildDir, "**/*"));
});

gulp.task("images", function () {
  gulp.src(sources.images).pipe(gulp.dest(imagesBuildDir));
});

gulp.task("css", function () {
  return finallizeAssetPipeline(gulp
    .src(sources.css)
    .pipe(concat("style.min.css"))
    .pipe(uncss({ html: [sources.index] }))
    .pipe(nano()));
});

gulp.task("js", function () {
  return finallizeAssetPipeline(gulp
    .src(sources.js)
    .pipe(eslint())
    .pipe(eslint.failAfterError())
    .pipe(concat("scripts.min.js"))
    .pipe(uglify()));
});

gulp.task("index", function () {
  var assetSources = gulp.src(path.join(assetsBuildDir, "*.+(js|css)"), { read: false, cwd: buildDir });

  gulp.src(sources.index)
    .pipe(inject(assetSources))
    .pipe(gulp.dest(buildDir))
    .pipe(livereload());
});

gulp.task("notifyCompletion", function () {
  gulp.src("").pipe(notify({
    sound: "Pop",
    onLast: true,
    title: "EasyBazaar",
    message: "Build Updated",
    contentImage: path.join(__dirname, "src/assets/images/favicon.png")
  }));
});

gulp.task("notifyServerStarted", function () {
  gulp.src("").pipe(notify({
    sound: "Pop",
    onLast: true,
    open: devServerURI,
    title: "EasyBazaar",
    subtitle: "Server started",
    message: "Listening on " + devServerURI,
    contentImage: path.join(__dirname, "src/assets/images/favicon.png")
  }));
});

gulp.task("serve", function () {
  connect.server({
    root: buildDir,
    livereload: true
  });

  livereload.listen();

  gulp
    .src(sources.index)
    .pipe(open({ uri: devServerURI }));
});

gulp.task("watch", function () {
  for (var name of Object.keys(sources)) {
    var tasks = ["index", "notifyCompletion"];
    if (name !== "index") tasks.unshift(name);
    gulp.watch(sources[name], tasks);
  }
});

function finallizeAssetPipeline(pipeline) {
  return pipeline
    .pipe(rev())
    .pipe(filesize())
    .pipe(gulp.dest(assetsBuildDir))
    .on("error", gutil.log);
}
