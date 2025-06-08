# Requirements - Tech stack

## Hosting
- The accounts and servers we have available are:
  - Supabase
  - Vercel
  - Cloudflare
  - A Debian 10 VPS with the following resources:
    - 2 CPU, 2.4GHz
    - 2.3GB memory available
    - SSH connectivity

## Local environment
- We should be able to very closely mimic the "Production" environment locally
- We should be confident that if the local environment has worked after a change, the Production environment will work in the same way 

## Relevant application requirements
- Application must be accessible by users across the globe
- A small amount of storage will be required, for users to be able to upload photographs of players and equipment
- Moderation for this application will primarily be done by Discord, e.g.
  - User submits review via website
  - Notification appears on Discord server with the review details
  - Users interact with the review to approve or deny it
- The application will be very read-heavy, with minimal writes
  - As such, we should strongly consider caching mechanisms
