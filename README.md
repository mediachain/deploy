# EasyBazaar
1-click deployment of a Digital Ocean droplet with OpenBazaar-Server installed and ready to go.

## Development
The build process is handled by Gulp. You can install Gulp with `npm install -g gulp`.

Start development server: `gulp`

File changes will be watched and if you have the [livereload extension](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei?hl=en) your page will reload automatically

Build static site: `gulp build`

Clean built asset: `gulp clean`

## Deployment

Deploy to Github pages with `gulp deploy:gh`
