import Footer from "@/components/footer";
import Header from "@/components/header";
import { Logo } from "@/components/logo";
import { PublicHeaderActions } from "@/components/public-header-actions-loader";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Fragment } from "react";

export default function NotFound() {
  return (
    <Fragment>
      <Header pathname="/" actions={<PublicHeaderActions />} />
      <main className="wrapper-center flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center">
        <Logo size={44} />
        <div className="flex flex-col gap-2">
          <Typography variant="h2" component="h1">
            404
          </Typography>
          <Typography className="text-muted-foreground">
            Things break sometimes. Go home,
            <br />
            or give me a shout.
          </Typography>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild>
            <a href="mailto:me@nublson.com">Get in touch</a>
          </Button>
        </div>
      </main>
      <Footer />
    </Fragment>
  );
}
