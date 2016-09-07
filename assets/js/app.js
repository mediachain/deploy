$(function () {
  "use strict";

  window.App = {
    createvps: createvps
  };

  //
  // MiniProvistor client-side application logic begins
  //

  var getDropletIPMaxAttempts = 60;
  var getDropletIPPollInterval = 5000;

  // create vps creates and sets up a droplet for production OpenBazaar use
  function createvps(caller, cloudInitScriptTemplate) {
    $("#dasinfo").html("<code>Working... please wait. Deployment of OpenBazaar can take up to 5 minutes. The IP address, username and password will be shown shortly.</code>");

    // Get the form calling this method
    var $form = $(caller).parents("form");

    // Get the required inputs from the form and validate them as much as we can
    var inputs = getInputsFromForm($form);

    // Generate passwords
    var vps_password = bip39.generateMnemonic();
    var ob_password = bip39.generateMnemonic();

    // Create a DO client
    var doClient = new DigitalOcean(inputs.token);

    // Perform the provisioning
    doClient.createDroplet({
        // Append utc epoch in milliseconds to name for uniqueness
        name: "obdroplet-" + (new Date().getTime()),

        // Add settings
        region: "sfo1",
        size: "512mb",

        // Use ubuntu 14.04 LTS
        image: "ubuntu-14-04-x64",

        user_data: Mustache.render(cloudInitScriptTemplate, {
          vps_password: vps_password,
          ob_password: ob_password,
        }),

        // No frills; users can opt-in later
        backups: false,
        ipv6: false,
        private_networking: null,
        volumes: null
      }).then(function (data) {
        return waitForCreation(doClient, data.droplet.id);
      })
      .done(function (data) {
        $("#dasinfo").html("OpenBazaar Installed on <kbd>" + data.droplet.networks
          .v4[0].ip_address + "</kbd></br></br><u>To login to your Digital Ocean VPS:</u></br>VPS username: <code>openbazaar</code></br>VPS password: <code>" + vps_password + "</code></br></br><u>To login to your OpenBazaar node:</u></br>Username: <code>admin</code></br>OB password: <code>" + ob_password + "</code></br></br><strong>Save these details immediately!</strong>");
      })
      .fail(function (err) {
        handleError(err);
        if (JSON.stringify(err.status) == 401) {
          $('#dasinfo').html("<code>" + JSON.stringify(err.responseJSON.message) + "</code></br></br><code>Please check that your API token is correct.</code>");
        }
        else {
          $('#dasinfo').html("<code>" + JSON.stringify(err.responseJSON.message) + "</code>.");
        }
      });
  }

  //
  // Private methods
  //

  // handleError logs the error and shows it to the  user
  function handleError(error) {
    console.log("error creating droplet");
    /*$('#dasinfo').text(err);*/
    return false;
  }

  // getInputsFromForm returns an object with the required inputs for node creation
  function getInputsFromForm($form) {
    return {
      token: $form.find("#token").val(),
      size: $form.find("#size").val(),
      region: $form.find("#region").val()
    }
  }

  // waitForCreation polls the api X times trying to get the ip
  function waitForCreation(doClient, dropletId) {
    var deferred = $.Deferred();
    var attempts = 0;

    // poll gets droplet data and if an ipv4 exists we stop, otherwise keep going
    // until the configured stopping point
    function poll() {
      doClient.getDroplet(dropletId)
        .done(function (data) {
          var droplet = data.droplet || {};
          if (droplet.status === "active" && droplet.networks.v4.length) {
            deferred.resolve(data);
            return data;
          }

          if (attempts >= getDropletIPMaxAttempts) {
            deferred.reject(data);
          }

          attempts++
          setTimeout(poll, getDropletIPPollInterval);
        })
        .fail(function () {
          defer.reject.apply(this, arguments);
        });
    }

    // Start polling
    poll();

    // Return a promise to try really hard or fail
    return deferred.promise();
  }
});
