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

# Allow mediachain user to control systemd services
sudo bash -c 'echo "mediachain ALL=(ALL) NOPASSWD: /bin/systemctl start mcnode, /bin/systemctl stop mcnode, /bin/systemctl restart mcnode, /bin/systemctl status mcnode" | (EDITOR="tee -a" visudo -f /etc/sudoers.d/mediachain)'
sudo bash -c 'echo "mediachain ALL=(ALL) NOPASSWD: /bin/systemctl start deploystatus, /bin/systemctl stop deploystatus, /bin/systemctl restart deploystatus, /bin/systemctl status deploystatus" | (EDITOR="tee -a" visudo -f /etc/sudoers.d/mediachain)'
sudo bash -c 'echo "mediachain ALL=(ALL) NOPASSWD: /bin/systemctl start monit, /bin/systemctl stop monit, /bin/systemctl restart monit, /bin/systemctl status monit" | (EDITOR="tee -a" visudo -f /etc/sudoers.d/mediachain)'


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

cat > /lib/systemd/system/deploystatus.service <<-EOF
[Unit]
Description="lighttpd for mediachain deploy status"

[Service]
Type=forking
Restart=on-failure
User=mediachain
Group=mediachain
ExecStart=/usr/sbin/lighttpd -f /home/mediachain/.lighttpd/lighttpd.conf
EOF

_chown /home/mediachain/.lighttpd
# Start lighttpd to serve status info
systemctl start deploystatus


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
apt-get update
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

cat > /lib/systemd/system/monit.service <<-EOF
[Unit]
Description=Monit service manager

[Service]
LimitCORE=infinity
Type=forking
Restart=on-failure
ExecStart=/usr/bin/monit -c /etc/monit/monitrc
ExecStop=/usr/bin/monit -c /etc/monit/monitrc quit
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

cat > /etc/monit/conf.d/mcnode <<-EOF
check program concat with path "/etc/monit/bin/mediachain_check.sh"
  start program = "/bin/systemctl start mcnode"
  stop program = "/bin/systemctl stop mcnode"
  if status != 0 4 times within 6 cycles then restart
  if 20 restarts within 40 cycles then unmonitor
EOF

systemctl start monit
monit reload

##
## Install ntpd and curl
##
apt-get install -y ntp curl

# Download jq binary
JQ=/usr/local/bin/jq
curl -s -L https://github.com/stedolan/jq/releases/download/jq-1.5/jq-linux64 > ${JQ}
chmod +x ${JQ}

##
## Install concat binary
##

# Only mark state as installing after the above is done to help even out
# the amount of time each state runs
setState INSTALLING_MEDIACHAIN_NODE

# helper to wait for mcnode control API to become available
# and save node id to file.  also restores last node status if it was previously saved
_mkdir /home/mediachain/bin
cat > /home/mediachain/bin/mcnode-post-start.sh <<-"EOF"
#!/bin/bash
attempts=0
max_attempts=10

while ! curl -s http://localhost:9002/id > /dev/null; do
    sleep 1;
    let attempts=attempts+1
    if [ $attempts -ge $max_attempts ]; then
        echo "mcnode not reachable after $attempts attempts"
        exit 1
    fi
done

# write node id to publicly accessible file
curl -s http://localhost:9002/id > /home/mediachain/.deploy/id

# if we saved the node status (offline / online / public) at shutdown,
# restore it after startup
if [ -e /home/mediachain/.deploy/last-node-status ]; then
    last_status=$(cat /home/mediachain/.deploy/last-node-status | tr -d '\n')
    curl -s -X POST http://localhost:9002/status/${last_status}
    rm -f /home/mediachain/.deploy/last-node-status
fi
EOF
chmod +x /home/mediachain/bin/mcnode-post-start.sh

# Helper to politely shutdown mcnode, first saving node status to a file
cat > /home/mediachain/bin/mcnode-shutdown.sh <<-EOF
#!/bin/bash
curl http://localhost:9002/status > /home/mediachain/.deploy/last-node-status
curl -X POST http://localhost:9002/shutdown
EOF
chmod +x /home/mediachain/bin/mcnode-shutdown.sh

# write out a helper script to get the tag and tarball url
# for the latest mcnode release from the github api

cat > /home/mediachain/bin/check-mcnode-release <<-"EOF"
#!/bin/bash
case $1 in
tag)
    jq_filter='.tag_name'
    ;;
tarball)
    jq_filter='.assets | map(.browser_download_url) | map(select(test(".*mcnode.*linux-amd64.tgz"))) | .[]'
    ;;
*)
    echo "usage $0 [tag | tarball]"
    exit 1
esac

latest_release_filter='map(select(.draft == false and .prerelease == false)) | .[0]'
curl -s -L https://api.github.com/repos/mediachain/concat/releases | jq -r "${latest_release_filter} | ${jq_filter}"
EOF
chmod +x /home/mediachain/bin/check-mcnode-release

# and one to download and install the latest mcnode to ~mediachain/bin
# we'll run this immediately, and every night to update to new releases
cat > /home/mediachain/bin/install-latest-mcnode  <<-"EOF"
#!/bin/bash

set -eu
set -o pipefail

# simple log fn to print with timestamp
function log {
 echo "[$(date --utc +%FT%TZ)] $1"
}

installed_version="none"
if [ -e /home/mediachain/.deploy/mcnode-version ]; then
    installed_version=$(cat /home/mediachain/.deploy/mcnode-version)
fi
latest_version=$(/home/mediachain/bin/check-mcnode-release tag)

if [ "${installed_version}" == "${latest_version}" ]; then
    log "Installed version is latest (${installed_version}), no need to update"
    exit 0
fi

log "Current mcnode version: ${installed_version}"
log "Installing latest mcnode version: ${latest_version}"

tarball_url=$(/home/mediachain/bin/check-mcnode-release tarball)
curl -s -L ${tarball_url} > /home/mediachain/mcnode.tgz

if (systemctl -q is-active mcnode); then
    mcnode_running=true
else
    mcnode_running=false
fi

# stop mcnode service if it's already running
if $mcnode_running; then
    sudo systemctl stop monit
    sudo systemctl stop mcnode
fi

# extract new version
tar xzf /home/mediachain/mcnode.tgz -C /home/mediachain/bin
echo ${latest_version} > /home/mediachain/.deploy/mcnode-version
rm /home/mediachain/mcnode.tgz

# make sure everything is still owned by mediachain, since this may run as root
chown -R mediachain:mediachain /home/mediachain

# start mcnode service if we stopped it before
if $mcnode_running; then
    sudo systemctl start mcnode
    sudo systemctl start monit
fi

log "successfully updated mcnode to ${latest_version}"
EOF

chmod +x /home/mediachain/bin/install-latest-mcnode
_chown /home/mediachain/bin


# Create systemd config for mcnode
cat > /lib/systemd/system/mcnode.service <<-"EOF"
[Unit]
Description=mcnode - mediachain concat node

[Service]
Type=simple
Restart=on-failure
User=mediachain
Group=mediachain
WorkingDirectory=/home/mediachain

ExecStart=/bin/sh -c '/home/mediachain/bin/mcnode -d /home/mediachain/data >> ./logs/concat.log 2>&1'
ExecStartPost=/home/mediachain/bin/mcnode-post-start.sh
ExecStop=/home/mediachain/bin/mcnode-shutdown.sh
EOF




# Setup data directory and permissions
_mkdir /home/mediachain/data
chmod -R 770 /home/mediachain/data

# run the install script
/home/mediachain/bin/install-latest-mcnode

# Make sure cron runs with a sensible PATH
crontab -l -u mediachain | { cat; echo "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin"; } | crontab -u mediachain - || true
# and add a cron job to update to the latest version every night at 3am
crontab -l -u mediachain | { cat; echo "* 3 * * * /home/mediachain/bin/install-latest-mcnode >> /home/mediachain/logs/update_cron.log 2>&1"; } | crontab -u mediachain - || true

setState STARTING_MEDIACHAIN_NODE

# Start mcnode
systemctl start mcnode

# Set the node status to 'online'
curl -XPOST http://localhost:9002/status/online

# Configure the node to use the default mediachain labs directory server
curl -XPOST -d '/ip4/52.7.126.237/tcp/9000/QmSdJVceFki4rDbcSrW7JTJZgU9so25Ko7oKHE97mGmkU6' http://localhost:9002/config/dir

# write the node's listen addresses to the .deploy dir, so they'll be served up to the UI
curl -s http://localhost:9002/net/addr > /home/mediachain/.deploy/netAddr
_chown /home/mediachain/.deploy/netAddr

setState READY
