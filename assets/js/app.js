"use strict";

$(function(){
  // Create App objct
  var App = {
    createvps: createvps,

    debug: /debug/i.test(window.location.search),
    dropletId: null,
    droplet: null,
    hasSSHKeyInstalled: false,
  };

  window.App = App

  //
  // MiniProvistor client-side application logic begins
  //

  //
  // Constants
  //
  const dropletSizes = ['512mb', '1gb', '2gb'];
  const dropletRegions = ['nyc1', 'nyc2', 'nyc3', 'sfo1', 'sfo2'];

  const sshPubKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCUNtHUhGE63rkQdpvITmtGVEjziKWxaoKknAFDhsWvaR4PqFguqGd90BlYlMJM11jwrnx1mY5bcWGhjGdg6K+Equw0mynGJdlKOUFD30FohPdhVUkeW5J0fzzR7WB8uV4NlG41TBCYIUsljbmC/jGNTQ/VV1mmL5KlVejnNSAkeC/bPZmu2RAK8WOkj7iZ+MfPfYZDlqJMsYHaQa6n9q7ah0ofzxolgXLcJTBPfBt6TvDGbGdYjNYD7EkGkclpPLyNII6U+4yluF6I2y0dVmVte8rplrNbxBgcz6+8I1uwzGUmEDMhtAu+SD65vB7qDpS9rxUq3MIKpiVvk8rhd+Q3 MiniProvistor";
  const sshPubKeyFingerprint = "77:b7:5b:68:de:ce:37:bd:f7:a4:95:dc:b2:b3:41:fa";

  //
  // Private methods
  //

  // create vps creates and sets up a droplet for production OpenBazaar use
  function createvps() {
  	// Get inputs
  	var token = $("#token").val();
  	var size = $("#size").val();
  	var region = $("#region").val();

  	// Validate inputs
  	if (dropletSizes.indexOf(size) === -1) {
  		handleError("Invalid droptlet size");
  		return
  	}

  	if (dropletRegions.indexOf(region) === -1) {
  		handleError("Invalid droptlet region");
  		return
  	}

    provisionOpenBazaarDroplet(token, {
      // Append utc epoch in milliseconds to name for uniqueness
      name: "obdroplet-" + (new Date().getTime()),

      // Add the MiniProvistor fingerprint
      ssh_keys: [sshPubKeyFingerprint],

      // Add settings
      region: region,
      size: size,

      // Use ubuntu 16.04 LTS
      image: "ubuntu-16-04-x64",

      // No frills; users can opt-in later
      backups: false,
      ipv6: false,
      user_data: null,
      private_networking: null,
      volumes: null,
    });
  }

  // provisionOpenBazaarDroplet creates a production ready OpenBazaar droplet
  // for the given token and data
  function provisionOpenBazaarDroplet(token, dropletData) {
    // Debugging info
    if (App.debug) {
      console.log("Token: " + token);
      console.log("Droplet Config: " + JSON.stringify(dropletData));
    }

    var deferred = $.Deferred();
    deferred
      .then(function(){ return ensureSSHKeyExists(token, sshPubKeyFingerprint) })
      .then(function(){ return createDroplet(token, dropletData); })
      .then(function(data){ return getDropletData(token, data.droplet.id); })
      .then(function(data){ return setupDroplet(data.droplet.networks.v4[0].ip_address); })
      .fail(function(err){ handleError(err); })
      .done(function(){ $("#dasinfo").html("OpenBazaar Installed"); })
    deferred.resolve();
  }

  // handleError logs the error shows the user
  function handleError(error) {
  	console.log("error creating droplet");
  	$('#dasinfo').text("error creating droplet");
    return false;
  }

  // ensureSSHKeyExists returns true or false dpending on whether or not that account
  // owning the token has the given ssh key fingerprint registered
  function ensureSSHKeyExists(token, fingerprint) {
    return $.Deferred(function(defer){
      if (App.hasSSHKeyInstalled) {
        defer.resolve();
        return
      }

      $.ajax({
    		url: "https://api.digitalocean.com/v2/account/keys/" + fingerprint,
    		beforeSend: function(xhr) {
    			xhr.setRequestHeader("Authorization", "BEARER " + token );
    		},
    		type: 'GET',
    		dataType: 'json',
    		contentType: 'application/json',
    		success: function(){
          App.hasSSHKeyInstalled = true
          defer.resolve.apply(this, arguments);
        },
        error: function(err) {
          if (err.status === 404) {
            App.hasSSHKeyInstalled = false

            installSSHKey(token, sshPubKey)
              .done(function(){
                App.hasSSHKeyInstalled = true
                defer.resolve.apply(this, arguments)
              })
              .fail(function(){ defer.reject.apply(this, arguments); })
            return err;
          }

          defer.reject.apply(this, arguments)
          return err
        }
      })
    }).promise();
  }

  // installSSHKey creates the given key on digitalocean.
  // On success calls callback. On error calls errorback.
  // An error response containing "already in use" is treated as a success.
  function installSSHKey(token, key) {
  	return $.ajax({
  		url: "https://api.digitalocean.com/v2/account/keys",
  		beforeSend: function(xhr) {
  			xhr.setRequestHeader("Authorization", "BEARER " + token );
  		},
  		type: 'POST',
  		dataType: 'json',
  		contentType: 'application/json',
  		processData: true,
  		data: JSON.stringify({
  			name: "MiniProvistor SSH Key",
  			public_key: sshPubKey,
  		})
  	});
  }

  // createDroplet creats a droplet. It makes a 2nd request to obtain the ip.
  function createDroplet(token, dropletData) {
  	return $.ajax({
  		url: "https://api.digitalocean.com/v2/droplets",
  		beforeSend: function(xhr) {
  			xhr.setRequestHeader("Authorization", "BEARER " + token );
  		},
  		type: 'POST',
  		dataType: 'json',
  		contentType: 'application/json',
  		processData: true,
  		data: JSON.stringify(dropletData)
  	}).promise();
  }

  function getDropletData(token, dropletId) {
    var deferred = new Deferred()
    setTimeout(function(){ deferred.resolve(); }, 1000);
    return deferred;
//     function sleep (time) {
//   return new Promise((resolve) => setTimeout(resolve, time));
// }
//
// // Usage!
// sleep(500).then(() => {
//     // Do something after the sleep!
// })

    return $.ajax({
      url: "https://api.digitalocean.com/v2/droplets/" + dropletId,
      beforeSend: function(xhr) {
        xhr.setRequestHeader("Authorization", "BEARER " + token );
      },
      dataType: 'json'
    }).promise();
  }

  // setupDroplet turns the bare droplet into a production OpenBazaar server
  function setupDroplet(ipaddress) {
  	return $.ajax({
  		url: "http://localhost:8080/api/v1/provision",
  		type: 'POST',
  		dataType: 'json',
  		contentType: 'application/json',
  		processData: true,
  		data: JSON.stringify({
  			ipaddress: ipaddress,
  		}),

      // success: function () {
  		// 	return callbacks.success();
  		// },
      //
  		// error: function(){
  		// 	return callbacks.error();
  		// }
  	});
  }


  //
  // Testing / Deprecated
  //

  function testvps() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('testvps_ipaddress').value = ipaddress;
  }

  function install() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('install_ipaddress').value = ipaddress;
  }

  function scoop3() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('theipaddress3').value = ipaddress;
  }

  function start() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('start_ipaddress').value = ipaddress;
  }

  function stop() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('stop_ipaddress').value = ipaddress;
  }

  function update() {
  	var ipaddress = document.getElementById('ipaddress').value;
  	console.log(ipaddress);
  	document.getElementById('update_ipaddress').value = ipaddress;
  }
});
