require_relative "spec_helper"

def check_dir_listing_content_type(content_type)
  content_type.must_match(%r{application\/(ld\+)?json})
  if content_type != "application/ld+json"
    puts "WARNING: the content type \"#{content_type}\" works for directory listings, but the correct one to use is \"application/ld+json\"".yellow
  end
end