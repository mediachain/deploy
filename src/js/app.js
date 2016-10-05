import Vue from 'vue';
import $ from 'jquery';
import ViewState from './viewState';
import NodeStates from './nodeStates';
import DigitalOcean from './digitalocean';

// Development helpers
const log = (msg) => console.log(msg);
const obRelayBranch = 'master';

// Set limits on how fast/much we poll for a new droplet to be active
// Try every 5 seconds for 10 minutes
const getDropletStateMaxAttempts = 120;
const getDropletStatePollInterval = 5000;

// Set limits on how fast/much we poll for a provisioning to finish
// Try every 30 seconds for 10 minutes
const getReadyStatusMaxAttempts = 120;
const getReadyStatusPollInterval = 30000;

// cloudInitScriptTemplate is a template for an OpenBazaar provisioning script
let cloudInitScriptTemplate = $('#cloud-init-script-template')[0].innerText;

// API key validation
let invalidAPIKeys = {};

function validateAPIKey(apiKey) {
  invalidAPIKeys[apiKey] = invalidAPIKeys[apiKey] || !!apiKey.match(/[a-z0-9]{64}/);
  return !!invalidAPIKeys[apiKey];
}

// Create App object
const App = window.App = new Vue({
  data: ViewState,
  el: document.getElementById('container'),
  methods: {
    createvps: function createvps() {
      if (!validateAPIKey(this.apiKey)) {
        this.showBlankAPIKeyAsInvalid = true;
        return false;
      }

      log('Provisioning node.');

      provisionNode()

      // Droplet is created and provisioned. User can now login and use their store.
      .done(function (droplet) {
        log('Finished provising droplet:');
        log(JSON.stringify(droplet));
      })

      // Show error message upon failure
      .fail(function (err) {
        if (err.responseJSON && err.responseJSON.message) log(JSON.stringify(err.responseJSON.message));
        if (!err.responseJSON && !err.responseJSON.message) log('An unknown error has occured.');
        if (JSON.stringify(err.status) == 401) {
          log('Please check that your API token is correct.');
          ViewState.nodes[0].state = NodeStates.WAITING;
        }
        return false;
      });
    },
  },

  computed: {
    node: function () { return this.nodes[0]; },

    nodeStates: () => NodeStates,

    showInvalidAPIKey: function () {
      if (this.showBlankAPIKeyAsInvalid) return true;
      return this.apiKey !== '' && !validateAPIKey(this.apiKey);
    },
  },
});

// provisionNode creates and sets up a droplet for production OpenBazaar use
function provisionNode() {
  // Get node object and update its state
  let node = ViewState.nodes[0];
  node.state = NodeStates.CREATING_DROPLET;

  // Create a DO client
  let doClient = new DigitalOcean(App.apiKey);


  // Perform the provisioning
  return doClient.createDroplet({
    name: node.name,
    size: '512mb',
    region: 'sfo1',
    image: 'ubuntu-14-04-x64',
    user_data: cloudInitScriptTemplate
      .replace('{{vpsPassword}}', node.vpsUser.password)
      .replace('{{obPassword}}', node.obUser.password)
      .replace('{{obRelayBranch}}', obRelayBranch),
  })

  // After creating the droplet we need to wait for it to be active
  .then(function (data) {
    return waitForCreation(doClient, data.droplet.id);
  })

  // Once it's active show a message to the user with their details and wait
  // for the provising to be finished
  .then(function (data) {
    node.ipv4 = data.droplet.networks.v4[0].ip_address;
    node.state = NodeStates.INSTALLING_OB_RELAY;

    // Show a message to the user indicating we're building their server
    log('Your Digital Ocean droplet was created and can be found at <kbd>' + node.ipv4 +
      '</kbd>. OpenBazaar is now installing.</br></br><u>To login to your droplet via SSH:</u></br>Droplet username: <code>openbazaar</code></br>Droplet password: <code>' + node.vpsUser.password + '</code></br></br>The OpenBazaar node is installing on your droplet and should be ready in <strong>5-7 minutes</strong>.</br></br><u>To login to your OpenBazaar node:</u></br>Username: <code>admin</code></br>OB password: <code>' + node.obUser.password + '</code></br></br><strong>Save these details immediately!</strong>');

    // Now just wait for everything to be ready
    return waitForReadyState(node);
  });
}

// waitForCreation polls the api X times trying to get the ip
function waitForCreation(doClient, dropletId) {
  let deferred = $.Deferred(),
    attempts = 0;

  // poll gets droplet data and if an ipv4 exists we stop, otherwise keep going
  // until the configured stopping point
  function poll() {
    doClient.getDroplet(dropletId)

    // If the request was successful check if the droplet is active. If so we
    // are done. If not try again. If we've hit the limit fail.
    .done((data) => {
      let droplet = data.droplet || {};
      if (droplet.status === 'active' && droplet.networks.v4.length) {
        return deferred.resolve(data);
      }

      if (attempts >= getDropletStateMaxAttempts) {
        deferred.reject(new Error('Too many attempts'));
      }

      attempts++;
      setTimeout(poll, getDropletStatePollInterval);
    })

    // If the request fails just reject the promise
    .fail(deferred.reject);
  }

  // Start polling
  poll();

  // Return a promise to try really hard or fail
  return deferred.promise();
}

// waitForReadyState waits for ob-relay to report the READY status
function waitForReadyState(droplet) {
  let deferred = $.Deferred(),
    attempts = 0,
    statusAddr = 'https://deploy.ob1.io/cors/status/' + droplet.ipv4;

  function poll() {
    $.get(statusAddr)

    // If the request was successful see if we're in the READY status. If so we
    // are done. If not try again unless we're at our limit.
    .always(function (data, requestStatus) {
      // Update the droplet state if the request was successful. If it's READY
      // we're done so resolve the promise with the droplet.
      if (requestStatus === 'success') {
        ViewState.state = droplet.state = JSON.parse(data).status;
        log(ViewState.state);
        if (ViewState.state === 'READY') return deferred.resolve(droplet);
      }

      // Ensure we haven't tried too many times
      if (attempts >= getReadyStatusMaxAttempts) return deferred.reject(new Error('Too many attempts'));

      // Try again later
      attempts++;
      setTimeout(poll, getReadyStatusPollInterval);
    });
  }

  // Start polling
  poll();

  // Return a promise to try really hard or fail
  return deferred.promise();
}
