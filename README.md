# EasyBazaar
1-click deployment of a Digital Ocean droplet with OpenBazaar-Server installed and ready to go.

## Development
The build process is handled by Gulp. You can install Gulp with `npm install -g gulp`.


Start development server with change watching and live reload:
`gulp`

Build static site: `gulp build`

Clean built asset: `gulp clean`

## Deployment

To deploy to Github pages ensure you have a `gh-pages` branch tracking `oriign/gh-pages`. You can configure this with `git branch --set-upstream-to=origin/<branch> gh-pages`

Deploy to Github pages with `gulp deploy:gh`
