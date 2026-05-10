##
## Zeek local site policy — network-monitor stack (macOS/brew compatible)
##

# Define the local network
redef Site::local_nets += { 192.168.178.0/24 };
redef Pcap::snaplen = 65535;

# JSON logging
@load policy/tuning/json-logs

# Standard protocol analyzers
@load base/protocols/conn
@load base/protocols/dns
@load base/protocols/http
@load base/protocols/ssl
@load base/frameworks/files

# Known hosts/services tracking
@load policy/protocols/conn/known-hosts
@load policy/protocols/conn/known-services

# Write logs to the shared volume
redef LogAscii::use_json = T;
redef Log::default_logdir = "/Users/feynman/repos/network-monitor/data/zeek-logs";
