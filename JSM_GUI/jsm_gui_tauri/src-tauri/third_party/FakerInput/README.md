# FakerInput virtual keyboard and mouse

Official release: https://github.com/Ryochan7/FakerInput/releases/tag/v0.1.1

Package: `FakerInput_Setup_0.1.1_x64.msi`

SHA-256: `4C0AEFB7340051A91D606776243298B5CD1143EF5508BBAE6800C474F9ED0840`

The upstream installer has a valid Authenticode signature from Ryodigi Solutions LLC.
Driver source is licensed under MIT: https://github.com/Ryochan7/FakerInput/blob/master/LICENSE
Copyright (c) Ryochan7 and contributors. See LICENSE for the upstream notice.

JSM Evolved uses its public HID protocol for keyboard and mouse output. The driver
lets Windows process those reports as keyboard/mouse input across process integrity
levels and desktop switches. No Windows security policy is changed. The existing
SendInput path remains available when the driver is absent or a key is unsupported.

Windows Sign-in only works when JSM Evolved is already running in the logged-on
Windows session. It does not start JSM before the first login after a reboot.
