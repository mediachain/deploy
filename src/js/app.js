/*globals Vue*/
import $ from 'jquery';
import clipboard from 'clipboard';
import Node from './node';
import ViewState from './viewState';
import NodeStates from './nodeStates';
import DigitalOcean from './digitalocean';

// Root URL of proxy service that we use to avoid mixed-content SSL errors
const statusProxyUrl = 'https://mediachain-droplet-status.herokuapp.com/';

function statusUrl (nodeIP) {
  return statusProxyUrl + nodeIP + ':9010/state'
}

function idUrl (nodeIP) {
  return statusProxyUrl + nodeIP + ':9010/id'
}

// Set limits on how fast/much we poll for a new droplet to be active
// Try every 5 seconds for 10 minutes
const getDropletStateMaxAttempts = 120;
const getDropletStatePollInterval = 5000;

// Set limits on how fast/much we poll for a provisioning to finish
// Try every 30 seconds for 10 minutes
const getReadyStatusMaxAttempts = 120;
const getReadyStatusPollInterval = 30000;

// The possible data centers we'll provision nodes in
const availableDataCenters = [
   // San Francisco
  'sfo1', 'sfo2',

  // New York
  'nyc1', 'nyc2', 'nyc3',

  // Toronto
  'tor1',
];

// cloudInitScriptTemplate is a template for an Mediachain provisioning script
let cloudInitScriptTemplate = $('#cloud-init-script-template').text();

// validateAPIKey checks an API key string for well-formedness
function validateAPIKey(apiKey) {
  return !!apiKey.match(/[a-z0-9]{64}/);
}

// Ask for confirmation when leaving during a provisioning.
window.onbeforeunload = function (e) {
  let stateOrdinal = ViewState.nodes[0].state.ordinal;
  if (stateOrdinal === 0 || stateOrdinal === NodeStates.enumValues.length - 1) return;
  return (e.returnValue = 'Your node isn\'t finished. Are you sure you want to leave?');
};

// Setup click-to-copy for credentials
new clipboard('[data-copy]').on('success', function (e) {
  $(e.trigger).addClass('copied');
  setTimeout(() => { $(e.trigger).removeClass('copied'); }, 3000);
});

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

      provisionNode()

      // Show error message upon failure
      .fail(function (err) {
        console.log(err);
        if (err.responseJSON && err.responseJSON.message) ViewState.error = err.responseJSON.message;
        if (!err.responseJSON || !err.responseJSON.message) ViewState.error = 'Unknown error';
        if (JSON.stringify(err.status) == 401) ViewState.error = 'Check your API token';
        ViewState.nodes[0].state = NodeStates.WAITING;
        return false;
      });
    },

    deployNewNode: function () {
      ViewState.nodes = [new Node()];
    },

    downloadCredentialsFile: function () {
      const creds = {
        host: this.node.ipv4,
        username: this.node.vpsUser.name,
        password: this.node.vpsUser.password,
        peer: {
          peerId: this.node.peerId,
          publisherId: this.node.publisherId,
          listenAddress: this.listenMultiaddr
        }
      };
      const credsStr = JSON.stringify(creds, null, 2);
      const el = document.createElement('a');
      el.setAttribute('href', 'data:application/octet-stream;charset=utf-8;base64,'
        + btoa(credsStr));

      el.setAttribute('download', `mediachain_node_${ this.node.ipv4 }.json`);
      el.style.display = 'none';
      document.body.appendChild(el);
      el.click();
      document.body.removeChild(el);
    },
  },

  computed: {
    node: function () { return this.nodes[0]; },

    sshForward: function() {
      return sshForwardString(this.nodes[0].ipv4);
    },

    listenMultiaddr: function() {
      const node = this.nodes[0];
      if (node.ipv4.length < 1 || node.peerId.length < 1) {
        return '';
      }
      return '/ip4/' + node.ipv4 + '/tcp/9001/p2p/' + node.peerId;
    },

    nodeStates: () => NodeStates,

    invalidAPIKey: function () {
      if (this.apiKey === '' && this.showBlankAPIKeyAsInvalid) return true;
      return this.apiKey !== '' && !validateAPIKey(this.apiKey);
    },
  },
});

function sshForwardString(ipv4) {
  if (ipv4 == null || ipv4.length < 1) {
    return '';
  }
  return 'ssh -nNT -L 9002:localhost:9002 mediachain@' + ipv4;
}

// provisionNode creates and sets up a droplet for production Mediachain use
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
    region: availableDataCenters[Math.floor(Math.random() * availableDataCenters.length)],
    image: 'ubuntu-14-04-x64',
    user_data: cloudInitScriptTemplate
      .replace('{{vpsPassword}}', node.vpsUser.password)
      .replace('{{sshPublicKey}}', node.sshPublicKey)
  })

  // After creating the droplet we need to wait for it to be active
  .then(function (data) {
    return waitForCreation(doClient, data.droplet.id);
  })

  // Once it's active show a message to the user with their details and wait
  // for the provising to be finished
  .then(function (data) {
    node.ipv4 = data.droplet.networks.v4[0].ip_address;
    node.state = NodeStates.INSTALLING_STATUS_SERVER;

    // Now just wait for everything to be ready
    return waitForReadyState(node);
  })

  // Request the peer and publisher ids
    .then(function () {
      return getNodeIds(node)
    })

    .then(function (nodeIds) {
      node.peerId = nodeIds.peer;
      node.publisherId = nodeIds.publisher;
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

// waitForReadyState waits for status server to report the READY status
function waitForReadyState(droplet) {
  let deferred = $.Deferred(),
    attempts = 0,
    statusAddr = statusUrl(droplet.ipv4);

  function poll() {
    $.get(statusAddr)

    // If the request was successful see if we're in the READY status. If so we
    // are done. If not try again unless we're at our limit.
    .always(function (data, requestStatus) {
      // Update the droplet state if the request was successful. If it's READY
      // we're done so resolve the promise with the droplet.
      if (requestStatus === 'success') {
        droplet.state = NodeStates.enumValueOf(data);
        if (droplet.state === NodeStates.READY) return deferred.resolve(droplet);
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


// getNodeIds requests the nodes peer and publisher ids.  should be called after
// waitForReadyState completes
function getNodeIds(droplet) {
  let deferred = $.Deferred(),
    attempts = 0,
    idAddr = idUrl(droplet.ipv4);

  function poll() {
    $.get(idAddr)

      .always(function (data, requestStatus) {
        if (requestStatus === 'success') {
          return deferred.resolve(JSON.parse(data));
        }

        if (attempts >= getReadyStatusMaxAttempts) return deferred.reject(new Error('Too many attempts'));
        attempts++
        setTimeout(poll, getReadyStatusPollInterval)
      })
  }

  poll();

  return deferred.promise();
}