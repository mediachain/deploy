/*globals $*/
$(function () {
  "use strict";

  // Create DigitalOcean object
  function DO(token) {
    this._token = token;
    this._root = "https://api.digitalocean.com/v2/";
  }

  window.DigitalOcean = DO;

  //
  // Droplet methods
  //

  DO.prototype.createDroplet = function (dropletData) {
    return this._request("POST", "droplets", {
      data: JSON.stringify(dropletData)
    });
  };

  DO.prototype.getDroplet = function (id) {
    return this._request("GET", "droplets/" + id);
  };


  //
  // Private methods
  //

  DO.prototype._request = function (method, path, reqData) {
    reqData = reqData || {};

    // Set the HTTP verb for the req
    reqData.type = method;

    // Set the token authorization header
    var token = this._token;
    reqData.beforeSend = function (xhr) {
      xhr.setRequestHeader("Authorization", "BEARER " + token);
    };

    // Set headders for sending and receiving JSON data
    if (!reqData.dataType) {
      reqData.dataType = "json";
    }

    if (!reqData.contentType) {
      reqData.contentType = "application/json";
    }

    // Build the url
    if (!reqData.url) {
      reqData.url = this._root + path;
    }

    // Return a promise for the request
    return $.ajax(reqData).promise();
  };
});
