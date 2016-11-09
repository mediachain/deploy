# Mediachain Deploy 🚀🎪
Simple Mediachain Cloud Hosting. Deploy a node to Digital Ocean in a few clicks.

## Development
The build process is handled by Gulp. You can install Gulp with `npm install -g gulp`.

Start development server: `gulp`

File changes will be watched and if you have the [livereload extension](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei?hl=en) your page will reload automatically

Build static site: `gulp build`

Clean built asset: `gulp clean`

## Deployment

Deploy to Github pages with `gulp deploy:gh`

## Test installation script

`docker run --rm -v $(pwd)//install.sh:/install.sh ubuntu:14.04 bash /install.sh`
