'use strict';

// Imports
import del from 'del';
import gulp from 'gulp';
import path from 'path';
import rev from 'gulp-rev';
import open from 'gulp-open';
import gutil from 'gulp-util';
import img from 'gulp-imagemin';
import nano from 'gulp-cssnano';
import concat from 'gulp-concat';
import inject from 'gulp-inject';
import notify from 'gulp-notify';
import uglify from 'gulp-uglify';
import rename from 'gulp-rename';
import connect from 'gulp-connect';
import ghPages from 'gulp-gh-pages';
import webpack from 'webpack-stream';
import filesize from 'gulp-filesize';
import runSequence from 'run-sequence';
import livereload from 'gulp-livereload';
import injectfile from 'gulp-inject-file';
import webpackConfig from './webpack.config.js';

const __dirname = path.resolve(path.dirname(''));

// URI of the dev server
const devServerURI = 'http://localhost:8080';

// Input sources globs. Keys should have 1-to-1 mapping with build:* commands.
const sources = {
  js: 'src/js/**/*.js',
  index: 'src/index.html',
  css: 'src/css/styles.css',
  fonts: 'src/fonts/*.otf',
  images: 'src/images/*.+(png|jpg|gif|svg)',
};

// Output directories/files
const buildRoot = path.join(__dirname, 'build');
const buildGlob = path.join(buildRoot, '**/*');

const build = {
  js: 'js/app.min.js',
  index: 'index.html',
  css: 'css/style.min.css',
  fonts: path.join(buildRoot, 'fonts'),
  images: path.join(buildRoot, 'images'),
};

// The image to use for growl notifications
const obIconSource = path.join(build.images, 'favicon.png');

//
// Conveniece composed tasks
//

gulp.task('default', ['dev']);

gulp.task('dev', ['build'], (done) => runSequence('watch', 'server:start', 'notify:server:start', done));

gulp.task('build', (done) => runSequence('clean', ['build:js', 'build:css', 'build:images', 'build:fonts'], 'build:index', done));

gulp.task('clean', (done) => del.sync(buildRoot) && done());

//
// Clean tasks
//

gulp.task('clean:js', (done) => del.sync(path.join(buildRoot, '**/*.js')) && done());

gulp.task('clean:css', (done) => del.sync(path.join(buildRoot, '**/*.css')) && done());

gulp.task('clean:images', (done) => del.sync(path.join(build.images)) && done());

gulp.task('clean:index', (done) => del.sync(path.join(build.index)) && done());

//
// Build tasks
//
gulp.task('build:fonts', () =>
  gulp.src(sources.fonts).pipe(gulp.dest(build.fonts))
);

gulp.task('build:images', () =>
  gulp
  .src(sources.images)
  .pipe(img({ progressive: false }))
  .pipe(gulp.dest(build.images))
);

gulp.task('build:css', function () {
  return gulp
    .src(sources.css)
    .pipe(concat(build.css))
    .pipe(nano())
    .pipe(rev())
    .pipe(filesize())
    .pipe(gulp.dest(buildRoot))
    .on('error', gutil.log);
});

gulp.task('build:js', function (done) {
  return gulp
    .src(sources.js)
    .pipe(webpack(webpackConfig).on('error', gutil.log))
    .pipe(uglify())
    .pipe(rev())
    .pipe(filesize())
    .on('complete', done)
    .on('error', gutil.log)
    .pipe(gulp.dest(buildRoot));
});

gulp.task('build:index', function () {
  var assetSources = gulp.src(path.join(buildRoot, '**/*.min.+(js|css)'), { read: false, cwd: buildRoot });

  return gulp.src(sources.index)
    .pipe(inject(assetSources, {
      transform: function (filepath) {
        // Use relative paths
        return inject.transform.call(inject.transform, filepath.replace(/^\//, ''));
      },
    }))
    .pipe(injectfile())
    .pipe(rename(build.index))
    .pipe(gulp.dest(buildRoot))
    .pipe(livereload());
});

//
// Notifications
//

gulp.task('notify:complete', function () {
  gulp.src('').pipe(notify(notifyOpts({ message: 'Build Updated' })));
});

gulp.task('notify:server:start', function () {
  gulp.src('').pipe(notify(notifyOpts({
    open: devServerURI,
    subtitle: 'Server started',
    message: 'Listening on ' + devServerURI,
  })));
});

function notifyOpts(opts) {
  opts.sound = 'Pop';
  opts.onLast = true;
  opts.title = 'Mediachain Deploy';
  opts.contentImage = obIconSource;
  return opts;
}

//
// Development server
//

// Start dev server with livereload
gulp.task('server:start', ['watch'], function (done) {
  // Start dev server
  connect.server({
    root: buildRoot,
    livereload: true,
  });

  livereload.listen();
  done();
});

// Open browser to app
gulp.task('server:open', ['serve'], function () {
  gulp.src(sources.index).pipe(open({ uri: devServerURI }));
});

//
// Change watches
//

gulp.task('watch', function (done) {
  Object.keys(sources).forEach(function (name, i, allNames) {
    gulp.watch(sources[name], function () {
      runSequence('clean:' + name, 'build:' + name, 'build:index', 'notify:complete');
    });

    if (i == (allNames.length - 1)) done();
  });
});

//
// Deployment
//

gulp.task('deploy:gh', function () {
  return gulp.src(buildGlob).pipe(ghPages({ cacheDir: '.deploy' }));
});
