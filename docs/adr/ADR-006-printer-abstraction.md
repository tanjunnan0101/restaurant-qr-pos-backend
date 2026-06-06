# ADR-006: Printer abstraction and local agent

Status: Accepted

Persist every print request as a job. Support Epson ePOS first, ESC/POS through a local network agent second, and browser/PDF fallback for emergencies. The local agent bridges the cloud API to printers on the restaurant Wi-Fi/LAN and reports heartbeats and print outcomes.
