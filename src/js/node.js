import bip39 from './vendor/bip39';
import NodeStates from './nodeStates';

// A VPS node
export default class Node {
  constructor() {
    this.name = 'obdroplet-' + (new Date().getTime());
    this.ipv4 = '';
    this.state = NodeStates.WAITING;
    this.obUser = {
      name: 'admin',
      password: bip39.generateMnemonic(),
    };
    this.vpsUser = {
      name: 'openbazaar',
      password: bip39.generateMnemonic(),
    };
  }

  state() {
    return this.state;
  }

  styleOptions(start, end) {
    return {
      started: this.stateHasStarted(start, end),
      finished: this.stateHasFinished(start, end),
    };
  }

  stateHasStarted(state) {
    return this.state.ordinal >= state.ordinal;
  }

  stateHasFinished(state) {
    return this.state.ordinal > state.ordinal;
  }
}
