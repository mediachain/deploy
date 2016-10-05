import bip39 from './vendor/bip39';
import NodeStates from './nodeStates';

const startingState = NodeStates.WAITING;

// A VPS node
export default class Node {
  constructor() {
    this.name = 'obdroplet-' + (new Date().getTime());
    this.ipv4 = '';
    this.state = startingState;
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
      finished: this.stateHasFinished(end ? end : start),
    };
  }

  stateHasStarted(state) {
    if (!this.state) new Error('Invalid state: ' + this.state);
    if (!state) new Error('Invalid state: ' + state);
    return this.state.ordinal >= state.ordinal;
  }

  stateHasFinished(state) {
    if (!this.state) new Error('Invalid state: ' + this.state);
    if (!state) new Error('Invalid state: ' + state);
    return this.state.ordinal > state.ordinal;
  }
}
