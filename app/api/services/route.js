
import fs from "fs";
import path from "path";
import {NextResponse} from "next/server";

export async function GET(){

const file=path.join(process.cwd(),"data","services.json");
const data=JSON.parse(fs.readFileSync(file));

return NextResponse.json(data);

}
