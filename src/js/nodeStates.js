import { Enum } from 'enumify';

class NodeStates extends Enum {}

NodeStates.initEnum([
  'WAITING',
  'CREATING_DROPLET',
  'INSTALLING_OPENBAZAAR_RELAY',
  'STARTING_OPENBAZAAR_RELAY',
  'INSTALLING_SYSTEM_PACKAGES',
  'INSTALLING_OPENBAZAAR_SERVER',
  'STARTING_OPENBAZAAR_SERVER',
  'READY',
]);

export default NodeStates;
