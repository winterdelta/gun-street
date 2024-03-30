import Image from "next/image";
import styles from "./page.module.css";
import { UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className={styles.main}>
      <UserButton />
    </main>
  );
}
