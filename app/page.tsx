import Editor from "./editor";
import {ready} from "@/lib/auth";
export default function Home(){return <Editor accountsEnabled={ready()}/>}
