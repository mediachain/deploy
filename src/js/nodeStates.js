import { Enum } from 'enumify';

class NodeStates extends Enum {}

NodeStates.initEnum([
  'WAITING',
  'CREATING_DROPLET',
  'INSTALLING_STATUS_SERVER',
  'INSTALLING_SYSTEM_PACKAGES',
  'INSTALLING_MEDIACHAIN_NODE',
  'STARTING_MEDIACHAIN_NODE',
  'READY',
]);

export default NodeStates;
