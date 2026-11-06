import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path:path.resolve(here,'../.env')});
dotenv.config();
const {connectDB}=await import('./config/db.js');
const {default:app}=await import('./app.js');
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32){console.error('JWT_SECRET must be at least 32 characters');process.exit(1);}
const port=process.env.PORT||5000;
try{await connectDB();app.listen(port,()=>console.log(`LuxuryStay API listening on ${port}`));}catch(err){console.error('Startup failed:',err.message);process.exit(1);}
