import $ from "jquery";

// Create DigitalOcean class
export default class {
  constructor(token) {
    this._token = token;
    this._root = "https://api.digitalocean.com/v2/";
  }

  // createDroplet makes a new droplet on the DigitalOcean
  // account using the provided dropletData.
  createDroplet(dropletData) {
    return this._request("POST", "droplets", {
      data: JSON.stringify(dropletData)
    });
  }

  // getDroplet returns information about the droplet with the given id
  getDroplet(id) {
    return this._request("GET", "droplets/" + id);
  }

  // _request makes an authenticated API request to DigitalOcean
  _request(method, path, reqData) {
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
  }
}
