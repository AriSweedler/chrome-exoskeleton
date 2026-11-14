# The native messaging host the service worker sends its installed version to
# (installed-version-host.mjs). Chrome starts a host with a bare environment,
# so the wrapper names its node by store path. A dotfiles flake builds this and
# places Chrome's host manifest with passthru.manifest:
#
#   home.file."Library/Application Support/Google/Chrome/NativeMessagingHosts/${host.hostName}.json".text =
#     builtins.toJSON (host.manifest [ "chrome-extension://<id>/" ]);
#
# hostName must match NATIVE_HOST in src/lib/service-worker/installed-version.ts.
{ lib, writeShellScriptBin, nodejs-slim }:
let
  hostName = "com.sweedler.chrome_exoskeleton";
  bin = "chrome-exoskeleton-native-host";
  host = writeShellScriptBin bin ''
    exec ${lib.getExe nodejs-slim} ${./installed-version-host.mjs} "$@"
  '';
in
host.overrideAttrs (old: {
  passthru = (old.passthru or { }) // {
    inherit hostName;
    manifest = allowedOrigins: {
      name = hostName;
      description = "Chrome Exoskeleton: records the running build in ~/.local/state/chrome-exoskeleton/installed-version";
      path = "${host}/bin/${bin}";
      type = "stdio";
      allowed_origins = allowedOrigins;
    };
  };
})
