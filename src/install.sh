#!/usr/bin/env bash
##
## Author: Tyler Smith <tyler@ob1.io>
## Mediachain-specific modifications: Yusef Napora <yusef@mediachainlabs.com>
##
## Description:
##   Install a Mediachain concat node.
##   We also run a lighttpd server to serve up a file containing the
##   status of the node installation, and the installed node's public key.
##   This lets us check
##

set -eux
set -o pipefail

##
## The docker ubuntu14.04 image needs these to get on the same level as the
## DigitalOcean iamge
##

if [ -f /.dockerenv ]; then
  apt-get update
  apt-get -y upgrade iptables
  apt-get install -y openssl ufw apt-transport-https software-properties-common python-software-properties python-setuptools
  dpkg-divert --local --rename --add /sbin/initctl
  rm /sbin/initctl
  ln -s /bin/true /sbin/initctl
fi

##
## Helper functions
##

# Set state writes a string to a file that ob-relay can use to determine progress
mkdir -p /home/mediachain/.deploy
function setState {
  echo -n "$1" > /home/mediachain/.deploy/state
}

# Set the ownership of the given directory to mediachain:mediachain
function _chown {
  chown -R mediachain:mediachain "$1"
}

# Create a directory owned by mediachain:mediachain
function _mkdir {
  mkdir "$1"
  chown -R mediachain:mediachain "$1"
}

##
## Start a lighttpd server to serve up the .deploy/state file, so we can check the
## status.
##

setState INSTALLING_STATUS_SERVER

# Create mediachain user and group
groupadd -f mediachain
useradd --shell /bin/bash --create-home --home /home/mediachain -g mediachain --password "$(openssl passwd -salt a -1 '{{vpsPassword}}')" mediachain

_chown /home/mediachain/.deploy

# Allow mediachain user to control upstart jobs
sudo bash -c 'echo "mediachain ALL=(ALL) NOPASSWD: /usr/sbin/service concat start, /usr/sbin/service concat stop, /usr/sbin/service concat restart, /usr/sbin/service concat status, /sbin/start concat, /sbin/stop concat, /sbin/restart concat" | (EDITOR="tee -a" visudo -f /etc/sudoers.d/mediachain)'
sudo bash -c 'echo "mediachain ALL=(ALL) NOPASSWD: /usr/sbin/service deploystatus start, /usr/sbin/service deploystatus stop, /usr/sbin/service deploystatus restart, /usr/sbin/service deploystatus status, /sbin/start deploystatus, /sbin/stop deploystatus, /sbin/restart deploystatus" | (EDITOR="tee -a" visudo -f /etc/sudoers.d/mediachain)'


# install and configure lighttpd

apt-get install -y lighttpd
mkdir -p /home/mediachain/.lighttpd
cat > /home/mediachain/.lighttpd/lighttpd.conf <<-EOF
server.document-root = "/home/mediachain/.deploy"
server.port = 9010
server.username = "mediachain"
server.groupname = "mediachain"
server.modules = ( "mod_setenv" )
setenv.add-response-header = (
  "Access-Control-Allow-Origin" => "*"
)
index-file.names = ( "index.html" )
EOF

cat > /etc/init/deploystatus.conf <<-EOF
description "lighttpd for mediachain deploy status"
start on runlevel [2345]
stop on runlevel [06]
respawn
setuid mediachain
setgid mediachain

exec /usr/sbin/lighttpd -D -f /home/mediachain/.lighttpd/lighttpd.conf
EOF


# Start lighttpd to serve status info
initctl reload-configuration && service deploystatus start


# If the user gave us a public ssh key, add it to ~/.ssh
SSH_PUBKEY="{{sshPublicKey}}"
if [ "$SSH_PUBKEY" != "" ]; then
    mkdir -p /home/mediachain/.ssh
    _chown /home/mediachain/.ssh
    echo $SSH_PUBKEY > /home/mediachain/.ssh/authorized_keys
fi

# Rotate logs daily
cat > /etc/logrotate.d/mediachain <<-EOF
/home/mediachain/logs/*.log {
  daily
  size 5M
  create 644 mediachain mediachain
  copytruncate
  rotate 14
  notifempty
  compress
  delaycompress
  missingok
  dateext
}
EOF

# Create directory for logs
_mkdir /home/mediachain/logs


##
## Install required system packages
##

setState INSTALLING_SYSTEM_PACKAGES

# Update packages and do basic security hardening
apt-get upgrade -y

# Install fail2ban to block brute force SSH attempts
apt-get install -y fail2ban

# Disable incoming traffic except for the specified ports
ufw disable && ufw --force enable
ufw default deny incoming
ufw allow 22/tcp
ufw allow 9001/tcp
ufw allow 9010/tcp

# Setup monitoring for hanging nodes
apt-get install -y monit

cat > /etc/init/monit.conf <<-EOF
description "Monit service manager"
limit core unlimited unlimited
start on runlevel [2345]
stop on starting rc RUNLEVEL=[016]
expect daemon
respawn
exec /usr/bin/monit -c /etc/monit/monitrc
pre-stop exec /usr/bin/monit -c /etc/monit/monitrc quit
EOF

mkdir -p /etc/monit/bin
cat > /etc/monit/bin/mediachain_check.sh <<-EOF
#!/bin/sh
curl --connect-timeout 60 http://localhost:9002/id
EOF
chmod +x /etc/monit/bin/mediachain_check.sh

cat > /etc/monit/monitrc <<-EOF
set daemon 300            # Run checks every 5 minutes
with start delay 1200     # Don't start checking until 20 minutes after startup

set logfile /var/log/monit.log
set idfile /var/lib/monit/id
set statefile /var/lib/monit/state

include /etc/monit/conf.d/*
EOF

cat > /etc/monit/conf.d/concat <<-EOF
check program concat with path "/etc/monit/bin/mediachain_check.sh"
  start program = "/usr/sbin/service concat start"
  stop program = "/usr/sbin/service concat stop"
  if status != 0 4 times within 6 cycles then restart
  if 20 restarts within 40 cycles then unmonitor
EOF

initctl reload-configuration
service monit start
monit reload

##
## Install ntpd
##
apt-get install -y ntp

##
## Install concat binary
##

apt-get install -y curl

# Only mark state as installing after the above is done to help even out
# the amount of time each state runs
setState INSTALLING_MEDIACHAIN_NODE

_mkdir /home/mediachain/bin
curl -L https://github.com/mediachain/concat/releases/download/v1.1/mcnode-v1.1-linux-amd64.tgz > /home/mediachain/mcnode.tgz
tar xzf /home/mediachain/mcnode.tgz -C /home/mediachain/bin


# Setup data directory and permissions
_mkdir /home/mediachain/data
chmod -R 770 /home/mediachain/data

setState STARTING_MEDIACHAIN_NODE

# Create Upstart script for concat
cat > /etc/init/concat.conf <<-EOF
description "Concat - mediachain node"
setuid mediachain
setgid mediachain
chdir /home/mediachain
respawn
start on runlevel [2345]
stop on runlevel [06]
exec ./bin/mcnode -d ./data >> ./logs/concat.log 2>&1

post-start script
    while ! curl http://localhost:9002/id > /dev/null; do sleep 1; done
    curl http://localhost:9002/id > /home/mediachain/.deploy/id
end script
EOF

# Start concat
initctl reload-configuration &&  service concat start

# Set the node status to 'online'
curl -XPOST http://localhost:9002/status/online

# Configure the node to use the default mediachain labs directory server
curl -XPOST -d '/ip4/52.7.126.237/tcp/9000/QmSdJVceFki4rDbcSrW7JTJZgU9so25Ko7oKHE97mGmkU6' http://localhost:9002/config/dir

# write the node's listen addresses to the .deploy dir, so they'll be served up to the UI
curl http://localhost:9002/net/addr > /home/mediachain/.deploy/netAddr

setState READY
