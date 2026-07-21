/**
 * Maps older, inaccessible Google Common Data Storage URLs to guaranteed, 
 * high-performance, and fully public Intel raw GitHub repository URLs.
 */
export function mapVideoUrl(url: string): string {
  if (!url) return url;
  
  const mappings: { [key: string]: string } = {
    'BigBuckBunny.mp4': 'classroom.mp4',
    'ElephantsDream.mp4': 'people-detection.mp4',
    'TearsOfSteel.mp4': 'car-detection.mp4',
    'ForBiggerBlazes.mp4': 'free-way-traffic.mp4',
    'ForBiggerEscapes.mp4': 'store-aisle-detection.mp4',
    'SubaruOutbackInTheHills.mp4': 'driver-action-recognition.mp4',
    'ForBiggerFun.mp4': 'face-demographics-walking-and-pause.mp4'
  };

  for (const [key, replacement] of Object.entries(mappings)) {
    if (url.includes(key)) {
      return `https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/${replacement}`;
    }
  }

  return url;
}
