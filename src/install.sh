#!/bin/bash

##
## Install OpenBazaar and ob-relay. The goal is to install ob-relay as
## quickly as possible so we can use it to communicate the installation
## status back to the end user. Only do the bare minimum first.
##

# Set state writes a string to a file that ob-relay can use to determine progress
mkdir -p /home/openbazaar/.deploy
function setState {
echo -n $1 > /home/openbazaar/.deploy/state
}

setState INSTALLING_OPENBAZAAR_RELAY

# Create openbazaar user and group
groupadd -f openbazaar
useradd --shell /bin/bash --create-home --home /home/openbazaar -g openbazaar --password "$(openssl passwd -salt a -1 '{{vpsPassword}}')" openbazaar

# Create directory for logs
mkdir /home/openbazaar/logs
chmod -R 660 /home/openbazaar/ssl

# Generate SSL cert
mkdir /home/openbazaar/ssl
openssl req -nodes -batch -x509 -newkey rsa:2048 -keyout /home/openbazaar/ssl/deploy.key -out /home/openbazaar/ssl/deploy.crt
chown -R openbazaar:openbazaar /home/openbazaar
chmod -R 760 /home/openbazaar/ssl

# Install git and nodejs
apt-key adv --keyserver keyserver.ubuntu.com --recv 68576280
apt-add-repository "deb https://deb.nodesource.com/node_6.x $(lsb_release -sc) main"
apt-get update
apt-get install -y git nodejs

# Install ob-relay
git clone https://github.com/OB1Company/ob-relay.git /home/openbazaar/ob-relay
cd /home/openbazaar/ob-relay && git checkout "{{obRelayBranch}}"
cd /home/openbazaar/ob-relay && npm install
chown -R openbazaar:openbazaar /home/openbazaar/ob-relay
chmod -R 760 /home/openbazaar/ob-relay

setState STARTING_OPENBAZAAR_RELAY

# Create Upstart script for ob-relay
cat > /etc/init/ob-relay.conf <<-EOF
setuid openbazaar
setgid openbazaar
chdir /home/openbazaar/ob-relay
respawn
start on runlevel [2345]
stop on runlevel [06]
env OB_RELAY_SSL_KEY_FILE="/home/openbazaar/ssl/deploy.key"
env OB_RELAY_SSL_CERT_FILE="/home/openbazaar/ssl/deploy.crt"
exec node /home/openbazaar/ob-relay/app.js >> /home/openbazaar/logs/ob-relay.log
EOF

# Start ob-relay
service ob-relay start

setState INSTALLING_SYSTEM_PACKAGES

# Update packages and do basic security hardening
apt-get upgrade -y

# Install fail2ban to block brute force SSH attempts
apt-get install -y fail2ban

# Disable incoming traffic except for the specified ports
ufw disable && ufw --force enable
ufw default deny incoming
ufw allow 22/tcp
ufw allow 8080/tcp
ufw allow 18466/tcp
ufw allow 18469/tcp
ufw allow 18470/tcp
ufw allow 18467/udp

setState INSTALLING_OPENBAZAAR_SERVER

# Install OpenBazaar-Server
apt-get install -y python2.7 build-essential python-dev libffi-dev libssl-dev
git clone https://github.com/OpenBazaar/OpenBazaar-Server.git /home/openbazaar/src
easy_install pip
pip install virtualenv
virtualenv --python=python2.7 /home/openbazaar/venv
/home/openbazaar/venv/bin/pip install -r /home/openbazaar/src/requirements.txt

# Create config file
cat > /home/openbazaar/ob.cfg <<-EOF
[CONSTANTS]
DATA_FOLDER = /home/openbazaar/data/
TRANSACTION_FEE = 20400
RESOLVER = https://resolver.onename.com/
[LIBBITCOIN_SERVERS]
mainnet_server1 = tcp://libbitcoin1.openbazaar.org:9091
mainnet_server3 = tcp://libbitcoin3.openbazaar.org:9091
mainnet_server5 = tcp://obelisk.airbitz.co:9091
[LIBBITCOIN_SERVERS_TESTNET]
testnet_server2 = tcp://libbitcoin2.openbazaar.org:9091,baihZB[vT(dcVCwkhYLAzah<t2gJ>{3@k?+>T&^3
testnet_server4 = tcp://libbitcoin4.openbazaar.org:9091,<Z&{.=LJSPySefIKgCu99w.L%b^6VvuVp0+pbnOM
[AUTHENTICATION]
SSL = True
SSL_CERT = /home/openbazaar/ssl/deploy.crt
SSL_KEY = /home/openbazaar/ssl/deploy.key
USERNAME = admin
PASSWORD = {{obPassword}}
[MAINNET_SEEDS]
mainnet_seed2 = seed2.openbazaar.org:8080,8b17082a57d648894a5181cb6e1b8a6f5b3b7e1c347c0671abfcd7deb6f105fe
mainnet_seed3 = seed.obcentral.org:8080,f0ff751b27ddaa86a075aa09785c438cd2cebadb8f0f5a7e16f383911322d4ee
[TESTNET_SEEDS]
testnet_seed1 = seed.openbazaar.org:8080,5b44be5c18ced1bc9400fe5e79c8ab90204f06bebacc04dd9c70a95eaca6e117
EOF

# Setup data directory and permissions
mkdir -p /home/openbazaar/data
chown -R openbazaar:openbazaar /home/openbazaar
chmod -R 760 /home/openbazaar
chmod 640 /home/openbazaar/ob.cfg

setState STARTING_OPENBAZAAR_SERVER

# Create Upstart script for OpenBazaar-Server
cat > /etc/init/openbazaard.conf <<-EOF
setuid openbazaar
setgid openbazaar
chdir /home/openbazaar
respawn
start on runlevel [2345]
stop on runlevel [06]
exec /home/openbazaar/venv/bin/python /home/openbazaar/src/openbazaard.py start -a 0.0.0.0 >> /home/openbazaar/logs/openbazaard.log
EOF

# Start OpenBazaar-Server
service openbazaard start

setState READY
