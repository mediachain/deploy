import Node from './node';

// ViewState contains all the application state. With this data and the app code
// one should be able to have a fully working setup.
class ViewState extends Object {
  constructor() {
    super();

    this.apiKey = '';
    this.nodes = [];

    this.nodes.push(new Node());
  }

  removeNode(v) {
    if (this.nodes.indexOf(v) === -1) return false;
    return this.nodes.splice(this.nodes.indexOf(v), 1);
  }
}

export default new ViewState();
