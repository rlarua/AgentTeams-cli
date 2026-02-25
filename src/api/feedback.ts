import axios from "axios";

export async function createFeedback(
  apiUrl: string,
  headers: Record<string, string>,
  body: {
    category: string;
    submitterType: "AI";
    title: string;
    content: string;
  }
): Promise<any> {
  const response = await axios.post(`${apiUrl}/api/feedbacks`, body, { headers });
  return response.data;
}
