# MongoDB on the VPS

The growth API needs MongoDB 8. It runs on the same Ubuntu 24.04 box as the
site, bound to localhost, with authentication on. Installing needs sudo, so
this is a one-time manual step.

## Install (paste into `ssh -t maple`, choose the password first)

```bash
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod

# an app user scoped to the one database
mongosh --quiet --eval 'db.getSiblingDB("maple_studios").createUser({user:"maple",pwd:"CHOOSE_A_DB_PASSWORD",roles:[{role:"readWrite",db:"maple_studios"}]})'

# require authentication from now on
sudo sed -i 's/^#security:/security:\n  authorization: enabled/' /etc/mongod.conf
sudo systemctl restart mongod
```

`mongod` listens on `127.0.0.1:27017` only (the package default). Keep it that way.

## Point the API at it

In `/home/deploy/maplestudios-site/backend/.env`:

```
MONGODB_URI=mongodb://maple:<the password>@127.0.0.1:27017/maple_studios?authSource=maple_studios
MONGODB_DB=maple_studios
```

Then `bash ~/deploy-maplestudios.sh` builds the API, creates the indexes and
the owner account (`npm run seed`, idempotent) and starts it. `curl
127.0.0.1:4006/readyz` returns 200 when the API can reach the database.

## Backups

Nothing backs this up by itself. A nightly dump is one cron line for the
`deploy` user:

```
15 2 * * * mongodump --uri="mongodb://maple:<pw>@127.0.0.1:27017/maple_studios?authSource=maple_studios" --archive=/home/deploy/backups/maple_studios-$(date +\%F).gz --gzip && find /home/deploy/backups -name 'maple_studios-*.gz' -mtime +14 -delete
```

Create `/home/deploy/backups` first. Restore with `mongorestore --uri=… --archive=<file> --gzip`.
