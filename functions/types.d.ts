type PagesFunction = (context: {
  request: Request;
  params: Record<string, string | string[]>;
}) => Response | Promise<Response>;
