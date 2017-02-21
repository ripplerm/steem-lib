'use strict';
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var webpack = require('webpack');
var pkg = require('./package.json');

var webpackConfig = {
    cache: true,
    entry: './src/index.js',
    output: {
      library: 'Steem',
      path: './build/',
      filename: ['steem-', '.js'].join(pkg.version)
    },
}

gulp.task('build-min', ['build'], function() {
  return gulp.src(['./build/steem-', '.js'].join(pkg.version))
  .pipe(uglify())
  .pipe(rename(['steem-', '-min.js'].join(pkg.version)))
  .pipe(gulp.dest('./build/'));
});

gulp.task('build', function(callback) {
  webpack(webpackConfig, callback);
});

gulp.task('default', ['build', 'build-min']);
